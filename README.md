# SEO Agents

This project contains an AI-powered agent for generating SEO search queries, built with TypeScript and utilizing OpenAI models.

## Features

- **SEO Query Finder (`src/index.ts`):** Generates multiple SEO-related search queries (e.g., long-tail keywords) based on an initial prompt.

## Project Structure

\`\`\`
SEOAgents/ # (Note: GitHub repo and local folder might still be DeepResearchAgents)
├── agents/ 
│   └── query-finder.ts # Original query finder, src/index.ts is now the main script
├── src/
│   └── index.ts      # Main script for the SEO Query Finder
├── .env 
├── .env.example
├── .gitignore
├── package.json
├── pnpm-lock.yaml
└── README.md
\`\`\`

## Prerequisites

- Node.js (v18 or higher recommended)
- pnpm (or npm/yarn)
- API key for OpenAI

## Setup

1.  **Clone the repository:**
    \`\`\`bash
    git clone https://github.com/LelantVaris/DeepResearchAgents.git # Or your new repo URL if you rename it on GitHub
    cd DeepResearchAgents # Or your new local folder name
    \`\`\`

2.  **Install dependencies:**
    \`\`\`bash
    pnpm install
    \`\`\`

3.  **Set up environment variables:**
    Copy `.env.example` to `.env` and add your `OPENAI_API_KEY`.
    \`\`\`bash
    cp .env.example .env
    \`\`\`
    Open `.env`:
    \`\`\`
    OPENAI_API_KEY=your_openai_api_key
    EXA_API_KEY= # No longer strictly needed unless you add Exa-based agents back
    PERPLEXITY_API_KEY= # No longer strictly needed
    \`\`\`

## Running the Agent

The main SEO Query Finder script is `src/index.ts`.

1.  Modify the `prompt` variable within the `main` function in `src/index.ts` to your desired SEO topic or base keywords.
    \`\`\`typescript
    const main = async () => {
      // Example prompt for SEO keyword generation
      const prompt = 'generate long-tail keywords for "eco-friendly pet supplies"'; 
      // ... rest of the main function
    };
    \`\`\`
2.  Run the script using the `dev` command (which points to `src/index.ts`):
    \`\`\`bash
    pnpm dev
    \`\`\`
    Or directly:
    \`\`\`bash
    pnpm tsx src/index.ts
    \`\`\`

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the ISC License. (You can add a `LICENSE` file with the ISC license text if desired).
