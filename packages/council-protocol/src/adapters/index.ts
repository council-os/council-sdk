/**
 * @council/protocol - Adapters Module
 *
 * Re-exports all external framework adapters.
 */

// LangChain Adapter
export {
  createLangChainAgentTransition,
  createLangChainChainTransition,
  createCouncilTool as createLangChainCouncilTool,
  createLangChainLLMInvoker,
  traceToToon as langchainTraceToToon,
} from "./langchain";

export type {
  LangChainAgent,
  LangChainAgentAdapterOptions,
  LangChainChain,
  LangChainLLM,
  LangChainLLMAdapterOptions,
  LangChainTool,
  LangChainTrace,
} from "./langchain";

// CrewAI Adapter
export {
  CouncilCrewBuilder,
  councilToCrewAIAgent,
  createCouncilTool as createCrewAICouncilTool,
  createCrewAICrewTransition,
  createCrewAITask,
  crewAIToCouncilAgent,
  traceToToon as crewaiTraceToToon,
} from "./crewai";

export type {
  CrewAIAdapterOptions,
  CrewAIAgent,
  CrewAICrew,
  CrewAICrewOutput,
  CrewAITask,
  CrewAITool,
  CrewAITrace,
} from "./crewai";
