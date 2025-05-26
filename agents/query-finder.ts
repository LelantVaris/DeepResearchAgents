import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import 'dotenv/config'
 
const mainModel = openai('gpt-4o')
 
const generateSearchQueries = async (query: string, n: number = 10) => {
  const {
    object: { queries },
  } = await generateObject({
    model: mainModel,
    prompt: `Generate ${n} search queries for the following query: ${query}`,
    schema: z.object({
      queries: z.array(z.string()).min(1).max(10),
    }),
  })
  return queries
}
const main = async () => {
    const prompt = 'what is the best auth provider for micro saas? '
    const queries = await generateSearchQueries(prompt)
    console.log(queries);
  }
   
  main()