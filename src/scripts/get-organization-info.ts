import { AppDataSource } from "../data-source.js";
import { Organization } from "../models/organization.js";
import { User } from "../models/user.js";

async function getOrganizationInfo() {
  console.log("🔍 Getting Organization Information");
  console.log("=".repeat(50));

  try {
    await AppDataSource.initialize();
    console.log("✅ Database connected");

    const organizationRepository = AppDataSource.getRepository(Organization);
    const userRepository = AppDataSource.getRepository(User);

    // Get all organizations
    const organizations = await organizationRepository.find({
      relations: ["parent", "children"],
      order: { type: "ASC", name: "ASC" },
    });

    console.log("\n📋 Organizations:");
    console.log("-".repeat(30));

    organizations.forEach((org) => {
      console.log(`\n🏢 ${org.name}`);
      console.log(`   Type: ${org.type}`);
      console.log(`   Status: ${org.status}`);
      console.log(`   ID: ${org.id}`);
      console.log(`   DID: ${org.did}`);
      console.log(`   Country: ${org.country || "N/A"}`);
      console.log(`   Parent: ${org.parent?.name || "None"}`);
      console.log(`   Children: ${org.children?.length || 0}`);
    });

    // Get users with their organization associations
    const users = await userRepository.find({
      relations: ["organization"],
      order: { username: "ASC" },
    });

    console.log("\n👥 Users and Organizations:");
    console.log("-".repeat(30));

    users.forEach((user) => {
      console.log(`\n👤 ${user.username} (${user.displayName})`);
      console.log(`   Organization: ${user.organization?.name || "None"}`);
      console.log(`   Role: ${user.organizationRole || "None"}`);
      console.log(`   DID: ${user.did || "None"}`);
    });

    // Get specific organization types
    console.log("\n🎯 Organization Types Summary:");
    console.log("-".repeat(30));

    const typeCounts: { [key: string]: number } = {};
    organizations.forEach((org) => {
      const type = String(org.type);
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    Object.entries(typeCounts).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    // Find government organizations (for the test)
    const governmentOrgs = organizations.filter(
      (org) => org.type === "government"
    );
    if (governmentOrgs.length > 0) {
      console.log("\n🏛️ Government Organizations (for testing):");
      console.log("-".repeat(30));
      governmentOrgs.forEach((org) => {
        console.log(`   ${org.name}: ${org.id} (${org.did})`);
      });
    }

    // Find school organizations (for the test)
    const schoolOrgs = organizations.filter((org) => org.type === "school");
    if (schoolOrgs.length > 0) {
      console.log("\n🏫 School Organizations (for testing):");
      console.log("-".repeat(30));
      schoolOrgs.forEach((org) => {
        console.log(`   ${org.name}: ${org.id} (${org.did})`);
      });
    }

    // Find users not associated with any organization
    const unassociatedUsers = users.filter((user) => !user.organizationId);
    if (unassociatedUsers.length > 0) {
      console.log("\n🔗 Users Available for Association:");
      console.log("-".repeat(30));
      unassociatedUsers.forEach((user) => {
        console.log(`   ${user.username} (${user.displayName})`);
      });
    }

    console.log("\n📝 Test Data for Manual Testing:");
    console.log("-".repeat(30));
    console.log("Use these values in your manual tests:");

    if (governmentOrgs.length > 0) {
      const gov = governmentOrgs[0];
      console.log(`\nGovernment Organization:`);
      console.log(`   ID: ${gov.id}`);
      console.log(`   DID: ${gov.did}`);
      console.log(`   Name: ${gov.name}`);
    }

    if (schoolOrgs.length > 0) {
      const school = schoolOrgs[0];
      console.log(`\nSchool Organization:`);
      console.log(`   ID: ${school.id}`);
      console.log(`   DID: ${school.did}`);
      console.log(`   Name: ${school.name}`);
    }

    if (unassociatedUsers.length > 0) {
      console.log(`\nAvailable Users:`);
      unassociatedUsers.forEach((user) => {
        console.log(`   ${user.username}`);
      });
    }
  } catch (error) {
    console.error("❌ Error getting organization info:", error);
  } finally {
    await AppDataSource.destroy();
    console.log("\n✅ Database connection closed");
  }
}

// Run the script
getOrganizationInfo()
  .then(() => {
    console.log("\n🏁 Script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Script failed:", error);
    process.exit(1);
  });

export { getOrganizationInfo };
