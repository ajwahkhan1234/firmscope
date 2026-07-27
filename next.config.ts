import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this, Next walks up and can pick a
  // lockfile outside the project (e.g. one in the home directory), which
  // changes how files are traced for the serverless bundle.
  turbopack: {
    root: path.resolve(process.cwd()),
  },

  // NOTE: do not add deepagents/@langchain/* to serverExternalPackages.
  // Marking them external tells Next not to bundle them, which leaves it to
  // Vercel's file tracing to copy them into the lambda. That tracing misses
  // parts of LangChain's dependency graph, so the route imported fine locally
  // (node_modules present) and threw MODULE_NOT_FOUND in production — a bare
  // HTTP 500 before any handler code ran. Letting Next bundle them fixes it.
};

export default nextConfig;
