import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import {
  streamText,
  convertToModelMessages,
  tool,
  stepCountIs,
} from "ai";
import { z } from "zod";

interface Env {
  AI: Ai;
  ChatAgent: DurableObjectNamespace;
}

export class ChatAgent extends AIChatAgent<Env> {
  async onChatMessage() {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const messages = await convertToModelMessages(
      this.messages.map(({ id: _id, ...message }) => message),
    );

    const result = streamText({
      model: workersai("@cf/zai-org/glm-4.7-flash"),
      system: `You are a helpful assistant for a note-taking app called Think.
You help the user explore their notes, ideas, and past conversations.
Respond in concise Markdown when formatting helps.
When the user asks about their notes or content, use the searchNotes tool to find relevant notes.
Use the readNote tool to get the full content of a specific note when needed.
When the user asks you to edit or rewrite a note, first inspect the relevant note, then call proposeNoteEdit with the note ID and the full revised markdown content.
Never claim an edit has already been applied. You only propose edits for the user to review and accept.
Reference specific notes by title when relevant.
If no notes match, say so honestly and offer to help with something else.`,
      messages,
      tools: {
        searchNotes: tool({
          description:
            "Search the user's local notes by keyword or topic. Returns matching note titles and previews. Use this whenever the user asks about their notes, ideas, or past writings.",
          inputSchema: z.object({
            query: z.string().describe("Search query to find relevant notes"),
          }),
        }),
        readNote: tool({
          description:
            "Read the full content of a specific note by its ID. Use this after searching to get the complete text of a relevant note.",
          inputSchema: z.object({
            noteId: z.string().describe("The note ID to read"),
          }),
        }),
        proposeNoteEdit: tool({
          description:
            "Propose an edit to a note for user approval. Use this only when the user asks to change, rewrite, summarize, or otherwise edit a note. Provide the full revised markdown content, not a partial patch.",
          inputSchema: z.object({
            noteId: z.string().describe("The note ID to update"),
            updatedContent: z
              .string()
              .describe("The complete revised markdown content for the note"),
            summary: z
              .string()
              .optional()
              .describe("A short summary of what changed and why"),
          }),
        }),
      },
      stopWhen: stepCountIs(5),
    });

    return result.toUIMessageStreamResponse();
  }
}

function corsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
}

export default {
  async fetch(request: Request, env: Env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const response =
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 });

    if (response.status === 101) {
      return response;
    }

    const headers = new Headers(response.headers);

    for (const [key, value] of Object.entries(corsHeaders())) {
      headers.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
} satisfies ExportedHandler<Env>;
