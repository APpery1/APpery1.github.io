// Explicit public descriptions take precedence over upstream repository metadata.
// Apply before curation so both JSON and JS snapshots contain the public text.
export function applyPublicMetadata(repos, policies) {
  if (!policies || typeof policies !== "object" || Array.isArray(policies)) {
    throw new Error("data/public-metadata.json 必须是仓库名到公开描述的映射");
  }
  for (const policy of Object.values(policies)) {
    if (
      !policy ||
      typeof policy !== "object" ||
      Array.isArray(policy) ||
      typeof policy.description !== "string" ||
      Object.keys(policy).some((key) => key !== "description")
    ) {
      throw new Error("公开元信息仅支持字符串 description 字段");
    }
  }
  return repos.map((repo) =>
    repo && typeof repo === "object" && Object.hasOwn(policies, repo.name)
      ? { ...repo, description: policies[repo.name].description }
      : repo,
  );
}
