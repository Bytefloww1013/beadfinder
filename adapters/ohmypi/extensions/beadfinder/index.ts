/**
 * Beadfinder policy pack for Oh My Pi.
 * Default-export hook factory. Loaded from .omp/extensions/beadfinder/.
 */
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import { asIssues, formatSnapshot, isAppendDecision, isClaimNext, isClosedStatus, isSessionBoot, issueId, labelsOf, parseClaimNextArgs, rememberScriptContext, runBd } from "./lib/bd.ts";
import { hooksDisabled } from "./lib/fsutil.ts";
import { advisor, debugEnabled, debugLog } from "./lib/log.ts";
import { isLikelyAdrPath, isProductPath, isProtectedPath, isTrackerSidecar } from "./lib/paths.ts";
import { loadState, recordClosed, saveState, type Persona } from "./lib/state.ts";
import {
  bashCommand,
  firstBdInvocation,
  flagValue,
  hasFlag,
  inputPath,
  isBashTool,
  isReadTool,
  isSpawnTool,
  isWriteTool,
  labelBlob,
  looksLikeProductWriteBash,
  spawnText,
  toolName,
} from "./lib/tools.ts";
import { registerDebug } from "./lib/debug.ts";
