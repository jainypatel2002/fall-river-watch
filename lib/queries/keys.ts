export const queryKeys = {
  reports: (filtersKey: string) => ["reports", filtersKey] as const,
  reportDetail: (id: string) => ["report-detail", id] as const,
  adminReports: (search: string, status: string, category: string) => ["admin-reports", search, status, category] as const,
  notificationSettings: ["notification-settings"] as const
};
