import { createWorkspaceHandler } from "~/lib/workspace-route";
import { getWorkspaceSnapshot } from "~/server/workspace";

export const GET = createWorkspaceHandler({
  getWorkspaceSnapshot,
});
