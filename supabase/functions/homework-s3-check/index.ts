import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3@3.879.0";

// TEMPORARY diagnostic function. Delete it after the storage connection test succeeds.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: { code: "invalid_request" } }, 405);
  }

  const accessKeyId = Deno.env.get("HOMEWORK_S3_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("HOMEWORK_S3_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("HOMEWORK_S3_BUCKET");
  const endpoint = Deno.env.get("HOMEWORK_S3_ENDPOINT");
  const region = Deno.env.get("HOMEWORK_S3_REGION");

  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint || !region) {
    return jsonResponse({ ok: false, error: { code: "storage_config_missing" } }, 500);
  }

  const key = `diagnostics/${crypto.randomUUID()}.txt`;
  let objectWasCreated = false;

  try {
    const s3 = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
    });

    try {
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: "mindcore-homework-storage-ok",
        ContentType: "text/plain",
      }));
      objectWasCreated = true;

      await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } finally {
      if (objectWasCreated) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      }
    }

    return jsonResponse({
      ok: true,
      storage: {
        bucket,
        write: true,
        head: true,
        delete: true,
      },
    });
  } catch (error) {
    // Do not log the error object: SDK errors can contain signed request details.
    console.error("Homework storage connection check failed", {
      error_type: error instanceof Error ? error.name : "UnknownError",
    });
    return jsonResponse({ ok: false, error: { code: "storage_connection_failed" } }, 500);
  }
});
