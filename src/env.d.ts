/// <reference path="../.astro/types.d.ts" />

import type { SessionPayload } from "./lib/admin/session";

declare global {
  namespace App {
    interface Locals {
      session?: SessionPayload | null;
    }
  }
}

export {};
