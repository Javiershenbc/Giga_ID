import { Router } from "express";
import { DataSource } from "typeorm";
import {
  HierarchyController,
  createOrganizationValidation,
  updateOrganizationStatusValidation,
  issueCredentialValidation,
  issueStudentCredentialByUsernameValidation,
  revokeCredentialValidation,
  revokeCredentialByAdminValidation,
  didParamValidation,
  organizationIdValidation,
  organizationTypeValidation,
  targetTypeValidation,
  associateUserValidation,
} from "../controllers/hierarchy.js";
import { ConfiguredAgent } from "../agent/setup.js";
import { requireAuth } from "../middleware/auth.js";

export function createHierarchyRoutes(
  agent: ConfiguredAgent,
  dataSource: DataSource
): Router {
  const router = Router();
  const hierarchyController = new HierarchyController(agent, dataSource);

  // Apply authentication middleware to all routes
  router.use(requireAuth);

  // Organization management routes
  router.post(
    "/organizations",
    createOrganizationValidation,
    hierarchyController.createOrganization.bind(hierarchyController)
  );

  router.get(
    "/organizations/with-users",
    hierarchyController.getOrganizationsWithUsers.bind(hierarchyController)
  );

  router.get(
    "/organizations/:id",
    organizationIdValidation,
    hierarchyController.getOrganization.bind(hierarchyController)
  );

  router.get(
    "/organizations/type/:type",
    organizationTypeValidation,
    hierarchyController.getOrganizationsByType.bind(hierarchyController)
  );

  router.get(
    "/hierarchy",
    hierarchyController.getHierarchy.bind(hierarchyController)
  );

  router.get(
    "/user/organizations",
    hierarchyController.getUserManagedOrganizations.bind(hierarchyController)
  );

  router.patch(
    "/organizations/:id/status",
    updateOrganizationStatusValidation,
    hierarchyController.updateOrganizationStatus.bind(hierarchyController)
  );

  // User-Organization association routes
  router.post(
    "/organizations/:organizationId/associate-user",
    associateUserValidation,
    hierarchyController.associateUserWithOrganization.bind(hierarchyController)
  );

  router.get(
    "/users/available",
    hierarchyController.getAvailableUsers.bind(hierarchyController)
  );

  // Credential management routes
  router.post(
    "/credentials/issue",
    issueCredentialValidation,
    hierarchyController.issueCredential.bind(hierarchyController)
  );

  router.post(
    "/credentials/issue-student",
    issueStudentCredentialByUsernameValidation,
    hierarchyController.issueStudentCredentialByUsername.bind(
      hierarchyController
    )
  );

  router.post(
    "/credentials/verify",
    hierarchyController.verifyCredential.bind(hierarchyController)
  );

  router.post(
    "/credentials/revoke",
    revokeCredentialValidation,
    hierarchyController.revokeCredential.bind(hierarchyController)
  );

  router.post(
    "/credentials/revoke-admin",
    revokeCredentialByAdminValidation,
    hierarchyController.revokeCredentialByAdmin.bind(hierarchyController)
  );

  // Credential query routes
  router.get(
    "/credentials/issued/:did",
    didParamValidation,
    hierarchyController.getIssuedCredentials.bind(hierarchyController)
  );

  router.get(
    "/credentials/received/:did",
    didParamValidation,
    hierarchyController.getReceivedCredentials.bind(hierarchyController)
  );

  router.get(
    "/credentials/chain/:did",
    didParamValidation,
    hierarchyController.getCredentialChain.bind(hierarchyController)
  );

  // Authorization routes
  router.get(
    "/issuers/:targetType",
    targetTypeValidation,
    hierarchyController.getAuthorizedIssuers.bind(hierarchyController)
  );

  // System summary endpoint
  router.get(
    "/summary",
    hierarchyController.getSystemSummary.bind(hierarchyController)
  );

  // User permissions check routes
  router.get(
    "/permissions/user/:username",
    hierarchyController.getUserPermissionsByUsername.bind(hierarchyController)
  );

  router.get(
    "/permissions/did/:did",
    hierarchyController.getUserPermissionsByDid.bind(hierarchyController)
  );

  router.get(
    "/permissions/id/:userId",
    hierarchyController.getUserPermissionsById.bind(hierarchyController)
  );

  // Transaction permissions check route
  router.get(
    "/can-send-transactions",
    hierarchyController.canSendTransactions.bind(hierarchyController)
  );

  return router;
}
