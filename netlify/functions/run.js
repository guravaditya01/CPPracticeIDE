export async function handler() {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      ok: false,
      error:
        "Online C++ execution is not enabled on this Netlify deployment yet. Editing and Google Drive sync work online, but running untrusted C++ needs a separate sandboxed runner.",
    }),
  };
}
