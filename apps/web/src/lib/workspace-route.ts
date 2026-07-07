import type { WorkspaceSnapshot } from "~/server/workspace";
import { createMarketUpstreamErrorResponse } from "./market-upstream-response";

export function createWorkspaceHandler(input: {
  getWorkspaceSnapshot: (ruleId: string) => Promise<WorkspaceSnapshot | null>;
}) {
  return async function GET(event: { params: { ruleId?: string } }) {
    const ruleId = event.params.ruleId;

    if (!ruleId) {
      return Response.json(
        {
          error: "Missing rule id",
        },
        { status: 400 },
      );
    }

    try {
      const snapshot = await input.getWorkspaceSnapshot(ruleId);

      if (!snapshot) {
        return Response.json(
          {
            error: "Rule not found",
          },
          { status: 404 },
        );
      }

      return Response.json(snapshot);
    } catch (error) {
      const response = createMarketUpstreamErrorResponse(error);

      if (response) {
        return response;
      }

      throw error;
    }
  };
}
