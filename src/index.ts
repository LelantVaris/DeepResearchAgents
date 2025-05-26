import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import 'dotenv/config';

const mainModel = openai('gpt-4o');

const generateSearchQueries = async (query: string, n: number = 10) => {
  const {
    object: { queries },
  } = await generateObject({
    model: mainModel,
    prompt: `Generate ${n} search queries for the following query: ${query}`,
    schema: z.object({
      queries: z.array(z.string()).min(1).max(10),
    }),
  });
  return queries;
};

const main = async () => {
  // Example prompt for SEO keyword generation
  const prompt = 'generate long-tail keywords for "eco-friendly pet supplies"'; 
  console.log(`Generating SEO search queries for: "${prompt}"`);
  const queries = await generateSearchQueries(prompt);
  console.log('\nGenerated SEO Search Queries:');
  queries.forEach((q, i) => console.log(`${i + 1}. ${q}`));
};

main(); 