/**
 * Beadfinder policy pack for Oh My Pi.
 * Default-export hook factory. Loaded from .omp/extensions/beadfinder/.
 */
import type { HookAPI } from "@oh-my-pi/pi-coding-agent/extensibility/hooks";
import { createBeadfinder } from "./lib/policy.ts";

export default function beadfinder(pi: HookAPI): void {
  createBeadfinder(pi);
}
