import { openai } from '@ai-sdk/openai';
import { generateObject, generateText, tool } from 'ai';
import { z } from 'zod';
import 'dotenv/config';
import Exa from 'exa-js';
import fs from 'fs';

// Initialize OpenAI and Exa clients
const mainModel = openai('gpt-4o'); // For primary generation tasks
const reportModel = openai('o3-mini'); // For report summarization
const exa = new Exa(process.env.EXA_API_KEY);

// --- Type Definitions ---
type SearchResult = {
  title: string;
  url: string;
  content: string;
};

type Learning = {
  learning: string;
  followUpQuestions: string[];
};

type Research = {
  query: string | undefined;
  queries: string[];
  searchResults: SearchResult[];
  learnings: Learning[];
  completedQueries: string[];
};

// Global object to store accumulated research data
const accumulatedResearch: Research = {
  query: undefined,
  queries: [],
  searchResults: [],
  learnings: [],
  completedQueries: [],
};

// --- Core Functions ---

// Generates search queries for a given input query.
const generateSearchQueries = async (query: string, n: number = 3) => {
  const {
    object: { queries },
  } = await generateObject({
    model: mainModel,
    prompt: `Generate ${n} distinct search queries for the following research topic: ${query}. Ensure the queries are varied and explore different facets of the topic.`,
    schema: z.object({
      queries: z.array(z.string()).min(1).max(5).describe("An array of search queries, between 1 and 5."),
    }),
  });
  return queries;
};

// Searches the web using Exa for a given query.
const searchWeb = async (query: string): Promise<SearchResult[]> => {
  console.log(`  -> Searching web with Exa for: "${query}"`);
  try {
    const { results } = await exa.searchAndContents(query, {
      numResults: 1, // Focus on the most relevant result per specific query
      livecrawl: 'always', // Use livecrawl for up-to-date information
    });
    return results.map(
      (r) =>
        ({
          title: r.title || 'No title',
          url: r.url,
          content: r.text || 'No content',
        } as SearchResult)
    );
  } catch (error) {
    console.error(`Error searching with Exa for query "${query}":`, error);
    return [];
  }
};

// Processes search results: evaluates relevance and extracts learnings.
const searchAndProcess = async (
  currentResearchQuery: string,
  allAccumulatedSources: SearchResult[]
): Promise<SearchResult[]> => {
  const pendingSearchResults: SearchResult[] = [];
  const finalRelevantResults: SearchResult[] = [];

  await generateText({
    model: mainModel,
    prompt: `You are a research assistant. Your current task is to find relevant information for the query: "${currentResearchQuery}". Use the searchWebTool, then evaluateAndStoreResult.`,
    system:
      'For each query, search the web using the "searchWebTool" tool. Then, use the "evaluateAndStoreResult" tool to determine if the found content is relevant and not a duplicate of previously found URLs. Your goal is to find useful, unique information.',
    tools: {
      searchWebTool: tool({
        description: 'Search the web for information about the given query. Returns raw search results.',
        parameters: z.object({
          queryToSearch: z.string().min(1).describe("The specific query to search the web with."),
        }),
        async execute({ queryToSearch }) {
          const results = await searchWeb(queryToSearch);
          if (results.length > 0) {
            pendingSearchResults.push(...results);
            return `Found ${results.length} result(s) for "${queryToSearch}". First result URL: ${results[0].url}. Now evaluate this result.`;
          }
          return `No results found for "${queryToSearch}". Try a different query.`;
        },
      }),
      evaluateAndStoreResult: tool({
        description: 'Evaluate the most recent search result from pendingSearchResults. If relevant and not a duplicate, add it to finalRelevantResults.',
        parameters: z.object({
            justification: z.string().describe("Brief justification for why the result is relevant or irrelevant.")
        }),
        async execute({justification}) {
          if (pendingSearchResults.length === 0) {
            return 'No pending search results to evaluate.';
          }
          const resultToEvaluate = pendingSearchResults.pop()!;
          
          const isDuplicate = allAccumulatedSources.some(src => src.url === resultToEvaluate.url);
          if (isDuplicate) {
            console.log(`  -> Evaluated: "${resultToEvaluate.url}" as DUPLICATE. Justification: ${justification}`);
            return `Result from ${resultToEvaluate.url} is a duplicate. Ignored.`;
          }

          const { object: evaluation } = await generateObject({
            model: mainModel,
            prompt: `Evaluate whether the following search result is relevant and directly helps answer the research query: "${currentResearchQuery}".\nAlso consider if it\'s a duplicate of already processed URLs.\nPreviously processed URLs: ${JSON.stringify(allAccumulatedSources.map(src => src.url))}\nCurrent Result:\nTitle: ${resultToEvaluate.title}\nURL: ${resultToEvaluate.url}\nContent Snippet (first 500 chars): ${resultToEvaluate.content.substring(0, 500)}\n\nJustification provided by previous step: ${justification}\nIs this relevant and NOT a duplicate based on the URL? Provide a boolean response.`,
            schema: z.object({isRelevant: z.boolean()})
          });

          if (evaluation.isRelevant) {
            finalRelevantResults.push(resultToEvaluate);
            console.log(`  -> Evaluated: "${resultToEvaluate.url}" as RELEVANT. Justification: ${justification}`);
            return `Result from ${resultToEvaluate.url} is relevant and has been stored. Justification: ${justification}`;
          } else {
            console.log(`  -> Evaluated: "${resultToEvaluate.url}" as IRRELEVANT. Justification: ${justification}`);
            return `Result from ${resultToEvaluate.url} is irrelevant. Ignored. Justification: ${justification}`;
          }
        },
      }),
    },
  });
  return finalRelevantResults;
};

// Generates learnings and follow-up questions from a relevant search result.
const generateLearnings = async (originalQuery: string, searchResult: SearchResult): Promise<Learning> => {
  console.log(`    -> Generating learnings for: "${searchResult.url}" related to query: "${originalQuery}"`);
  const { object } = await generateObject({
    model: mainModel,
    prompt: `The user is researching the topic: "${accumulatedResearch.query}".\nA sub-query was: "${originalQuery}".\nThe following search result was deemed relevant for that sub-query:\nTitle: ${searchResult.title}\nURL: ${searchResult.url}\nContent: ${searchResult.content.substring(0, 2000)}\n\nBased on this information, provide:\n1. A key learning or insight directly from this content relevant to the sub-query and overall research topic.\n2. A set of 1-2 specific follow-up questions that arise from this learning and would help deepen the research on the OVERALL topic.`,
    schema: z.object({
      learning: z.string().describe("A concise key learning from the search result."),
      followUpQuestions: z.array(z.string()).min(0).max(2).describe("0 to 2 follow-up questions for deeper research."),
    }),
  });
  return object;
};

// Performs deep research recursively.
let initialDepthUserSetting = 2; // For logging the current depth relative to the user's initial setting

const deepResearch = async (
  currentPrompt: string,
  depth: number,
  breadth: number
): Promise<Research> => {
  // Log current depth level based on the initial setting by the user for this specific call branch
  const currentDepthLevelForLogging = accumulatedResearch.query === currentPrompt ? 1 : (initialDepthUserSetting - depth + 1);
  console.log(`\n--- Depth Level ${currentDepthLevelForLogging} ---`);
  console.log(`Researching for: "${currentPrompt}" (Current Depth Remaining: ${depth}, Breadth: ${breadth})`);

  if (!accumulatedResearch.query) {
    accumulatedResearch.query = currentPrompt; // Set initial overall research query only once
  }

  if (depth === 0) {
    console.log('Maximum depth reached for this research path.');
    return accumulatedResearch;
  }

  const newQueries = await generateSearchQueries(currentPrompt, breadth);
  console.log('Generated sub-queries:', newQueries);
  // Add only truly new queries to the global list to avoid re-processing if structure allows overlap
  newQueries.forEach(q => {
      if (!accumulatedResearch.queries.includes(q)) accumulatedResearch.queries.push(q);
  });

  for (const query of newQueries) {
    if (accumulatedResearch.completedQueries.includes(query)) {
        console.log(`Skipping already processed query: "${query}"`);
        continue;
    }
    
    console.log(`Processing sub-query: "${query}"`);
    const relevantResults = await searchAndProcess(query, accumulatedResearch.searchResults);
    // Add only new results to global list
    relevantResults.forEach(rr => {
        if (!accumulatedResearch.searchResults.find(asr => asr.url === rr.url)) accumulatedResearch.searchResults.push(rr);
    });
    accumulatedResearch.completedQueries.push(query);

    for (const result of relevantResults) {
      const learningData = await generateLearnings(query, result);
      accumulatedResearch.learnings.push(learningData);
      console.log(`    Learnings: "${learningData.learning}"`);
      console.log(`    Follow-up questions: ${learningData.followUpQuestions.join('; ') || 'None'}`);

      if (learningData.followUpQuestions.length > 0) {
        const followUpPromptSeed = learningData.followUpQuestions.join('; ');
        const nextPrompt = `Overall research goal: "${accumulatedResearch.query}".\nPrior query: "${query}".\nLearning from prior query: "${learningData.learning}".\nInvestigate further based on follow-up questions: "${followUpPromptSeed}"`;
        // For recursive calls, pass the original depth setting for consistent logging
        await deepResearch(nextPrompt, depth - 1, Math.max(1, Math.ceil(breadth / 2)));
      }
    }
  }
  return accumulatedResearch;
};

// System prompt for the report generation.
const SYSTEM_PROMPT = `You are an expert researcher and analyst. Your task is to synthesize the provided research data into a coherent and insightful report.
Today is ${new Date().toISOString()}.
Follow these instructions when responding:
- The user is a highly experienced analyst; provide detailed and nuanced insights.
- Structure the report logically: Introduction/Executive Summary, Key Findings (organized by themes or original sub-queries), Learnings, and Conclusion/Potential Next Steps.
- For each key finding or learning, briefly mention the source URL if it's particularly illustrative.
- Synthesize information; don't just list raw data.
- If there are follow-up questions generated during research, highlight some of the most pertinent ones as areas for future investigation.
- Be highly organized and use Markdown formatting for clarity (headings, lists, bolding).`;

// Generates a report from the accumulated research data.
const generateReport = async (researchData: Research): Promise<string> => {
  console.log('\n--- Generating Final Report ---');
  if (researchData.learnings.length === 0 && researchData.searchResults.length === 0) {
    return "# Research Report\n\nNo significant learnings or search results were found to generate a detailed report. The initial queries may not have yielded relevant information, or the research depth/breadth was too limited for this topic.";
  }
  const { text } = await generateText({
    model: reportModel,
    system: SYSTEM_PROMPT,
    prompt:
      'Generate a comprehensive research report based on the following accumulated data. Focus on insights, key learnings, and unresolved follow-up questions:\n\n' +
      JSON.stringify(researchData, null, 2),
  });
  return text;
};

// Main execution function
const main = async () => {
  console.log("\n--- Deep Research Agent Initializing ---");
  // --- Configuration for the Deep Research ---
  // 1. Define the initial research prompt/topic:
  //    Uncomment one of the examples or add your own.
  
  const initialPrompt = 'What are the latest advancements in quantum computing and their potential impact on cryptography?';
  // const initialPrompt = 'Evaluate the market viability and key challenges for vertical farming in urban environments.';
  // const initialPrompt = 'What do you need to be a D1 shotput athlete?';
  // const initialPrompt = 'Explore the ethical implications of advanced AI-driven autonomous weapons systems.';
  // const initialPrompt = 'Generate long-tail keywords for "eco-friendly pet supplies" and research their competitive landscape.';

  // 2. Define the depth and breadth of the research:
  //    Depth: How many layers of follow-up questions to explore (e.g., 2 means initial query + 2 levels deeper).
  //    Breadth: How many sub-queries to generate at each level.
  initialDepthUserSetting = 2; // Max depth for the research. Used for logging consistency.
  const initialBreadth = 2;   // Number of sub-queries at each step.

  if (!process.env.OPENAI_API_KEY || !process.env.EXA_API_KEY) {
    console.error("🔴 ERROR: Missing OPENAI_API_KEY or EXA_API_KEY in your .env file. Please ensure they are set.");
    return;
  }
  if (!exa) {
      console.error("🔴 ERROR: Exa client failed to initialize. Check API key and Exa module.");
      return;
  }

  console.log(
    `🚀 Starting Deep Research...
    Topic: "${initialPrompt}"
    Initial Depth Setting: ${initialDepthUserSetting}
    Initial Breadth Setting: ${initialBreadth}
  `);

  try {
    // Pass the user-defined initial depth to the first call
    const finalResearchData = await deepResearch(initialPrompt, initialDepthUserSetting, initialBreadth);
    console.log('\n✅ Research completed!');
    
    console.log('\n💾 Generating and saving report...');
    const reportContent = await generateReport(finalResearchData);
    const reportFilename = 'deep_research_report.md';
    fs.writeFileSync(reportFilename, reportContent);
    console.log(`✅ Report saved to ${reportFilename}`);

    console.log(
      `\n--- Research Summary ---
      Initial Query: ${finalResearchData.query}
      Total Unique Queries Processed: ${finalResearchData.completedQueries.length}
      Total Unique Search Results Stored: ${finalResearchData.searchResults.length}
      Total Learnings Generated: ${finalResearchData.learnings.length}
    `);

  } catch (error) {
    console.error('\n🔴 FATAL ERROR during deep research process:');
    console.error(error);
  }
  console.log("\n--- Deep Research Agent Finished ---");
};

main(); 