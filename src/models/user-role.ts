export enum UserRole {
  GIGA_ADMIN = "giga_admin",
  GOVERNMENT_ADMIN = "government_admin",
  SCHOOL_ADMIN = "school_admin",
  TEACHER = "teacher",
  STUDENT = "student",
}

export interface UserOrganizationAssignment {
  userId: string;
  organizationId: string;
  role: UserRole;
  assignedAt: Date;
  assignedBy?: string; // User ID who assigned this role
}
