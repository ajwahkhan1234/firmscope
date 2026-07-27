import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this, Next walks up and can pick a
  // lockfile outside the project (e.g. one in the home directory), which
  // changes how files are traced for the serverless bundle.
  turbopack: {
    root: path.resolve(process.cwd()),
  },

  // deepagents/langchain pull in optional deps they don't need at runtime.
  // Leaving them external keeps them out of the bundle instead of failing
  // the build on a module that is never actually imported.
  serverExternalPackages: ["deepagents", "@langchain/langgraph", "cheerio"],
};

export default nextConfig;
