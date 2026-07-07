import { deleteAlert, markAlertRead } from "@warframe-market-tracker/db";

export async function POST(event: { params: { id?: string } }) {
  const alertId = event.params.id;

  if (!alertId) {
    return Response.json(
      {
        error: "Missing alert id",
      },
      { status: 400 },
    );
  }

  await markAlertRead(alertId);

  return new Response(null, { status: 204 });
}

export async function DELETE(event: { params: { id?: string } }) {
  const alertId = event.params.id;

  if (!alertId) {
    return Response.json(
      {
        error: "Missing alert id",
      },
      { status: 400 },
    );
  }

  await deleteAlert(alertId);

  return new Response(null, { status: 204 });
}
