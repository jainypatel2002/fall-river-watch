export const queryKeys = {
  reports: (filtersKey: string) => ["reports", filtersKey] as const,
  reportDetail: (id: string) => ["report-detail", id] as const,
  adminReports: (search: string, status: string, category: string) => ["admin-reports", search, status, category] as const,
  notificationSettings: ["notification-settings"] as const,
  events: (filtersKey: string) => ["events", filtersKey] as const,
  eventDetail: (id: string) => ["event-detail", id] as const,
  groups: (search: string) => ["groups", search] as const,
  groupDetail: (slug: string) => ["group-detail", slug] as const,
  groupMembership: (groupId: string) => ["group-membership", groupId] as const,
  groupJoinRequests: (slug: string) => ["group-join-requests", slug] as const,
  groupMembers: (slug: string) => ["group-members", slug] as const,
  groupPosts: (slug: string) => ["group-posts", slug] as const,
  groupChat: (slug: string) => ["group-chat", slug] as const,
  groupChatIdentity: (slug: string) => ["group-chat-identity", slug] as const
};
