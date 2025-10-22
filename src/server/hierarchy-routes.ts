import { Router } from "express";
import { DataSource } from "typeorm";
import {
  HierarchyController,
  createOrganizationValidation,
  updateOrganizationStatusValidation,
  organizationIdValidation,
  organizationTypeValidation,
  associateUserValidation,
} from "../controllers/hierarchy.js";
import { requireAuth } from "../middleware/auth.js";

export function createHierarchyRoutes(
  _agent: any,
  dataSource: DataSource
): Router {
  const router = Router();
  const hierarchyController = new HierarchyController(dataSource);

  // Apply authentication middleware to all routes
  router.use(requireAuth as any);

  // Organization management routes
  router.post(
    "/organizations",
    createOrganizationValidation,
    hierarchyController.createOrganization.bind(hierarchyController) as any
  );

  router.get(
    "/organizations/with-users",
    hierarchyController.getOrganizationsWithUsers.bind(
      hierarchyController
    ) as any
  );

  router.get(
    "/organizations/:id",
    organizationIdValidation,
    hierarchyController.getOrganization.bind(hierarchyController) as any
  );

  router.get(
    "/organizations/type/:type",
    organizationTypeValidation,
    hierarchyController.getOrganizationsByType.bind(hierarchyController) as any
  );

  router.get(
    "/hierarchy",
    hierarchyController.getHierarchy.bind(hierarchyController) as any
  );

  router.get(
    "/user/organizations",
    hierarchyController.getUserManagedOrganizations.bind(
      hierarchyController
    ) as any
  );

  router.patch(
    "/organizations/:id/status",
    updateOrganizationStatusValidation,
    hierarchyController.updateOrganizationStatus.bind(
      hierarchyController
    ) as any
  );

  // User-Organization association routes
  router.post(
    "/organizations/:organizationId/associate-user",
    associateUserValidation,
    hierarchyController.associateUserWithOrganization.bind(
      hierarchyController
    ) as any
  );

  router.get(
    "/users/available",
    hierarchyController.getAvailableUsers.bind(hierarchyController) as any
  );

  // Credential-related routes removed in Azure AD migration

  // System summary endpoint
  router.get(
    "/summary",
    hierarchyController.getSystemSummary.bind(hierarchyController) as any
  );

  return router;
}
