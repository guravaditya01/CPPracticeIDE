export async function handler() {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      ok: false,
      error:
        "Browser C++ execution could not start. Make sure the latest Netlify deploy includes cross-origin isolation headers, then hard refresh the page.",
    }),
  };
}
