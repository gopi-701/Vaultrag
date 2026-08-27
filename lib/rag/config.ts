import {
  DEFAULT_RERANK_CANDIDATE_LIMIT,
  DEFAULT_RERANK_TOP_K,
} from "@/lib/reranking/pipeline";
import { DEFAULT_CONTEXT_CHARACTER_BUDGET } from "@/lib/llm/context";

export const RAG_LIMITS = {
  vectorCandidateLimit: DEFAULT_RERANK_CANDIDATE_LIMIT,
  rerankedContextLimit: DEFAULT_RERANK_TOP_K,
  contextCharacterBudget: DEFAULT_CONTEXT_CHARACTER_BUDGET,
} as const;
