import { createDatabase } from "../config/database.js";
import { createVeramoAgent } from "../agent/setup.js";
import { OrganizationService } from "../services/organization.js";
import { HierarchicalCredentialService } from "../services/hierarchical-credential.js";
import {
  OrganizationType,
  OrganizationStatus,
} from "../models/organization.js";
import { CredentialType } from "../models/credential-record.js";
import { env } from "../config/env.js";
import { resetDatabase } from "./reset-database.js";

async function seedDatabase() {
  console.log("🌱 Starting Database Seeding Process");
  console.log("=".repeat(60));

  try {
    // First reset the database
    console.log("🔄 Resetting database...");
    await resetDatabase();

    // Initialize database and agent
    const dbConnection = await createDatabase(env.DB_NAME);
    const agent = await createVeramoAgent(dbConnection, env.SECRET_KEY);

    // Initialize services
    const organizationService = new OrganizationService(agent, dbConnection);
    const credentialService = new HierarchicalCredentialService(
      agent,
      dbConnection
    );

    console.log("✅ Services initialized successfully");

    // Step 1: Create Giga organization (root of hierarchy)
    console.log("\n📋 Step 1: Creating Giga Organization");
    const giga = await organizationService.createOrganization({
      name: "Giga",
      type: OrganizationType.GIGA,
      description: "UNICEF Giga Initiative - Root Authority",
      country: "Global",
      region: "Worldwide",
      contactEmail: "admin@giga.global",
    });
    console.log(`✅ Created Giga: ${giga.name}`);

    // Step 2: Create Country Office organizations
    console.log("\n📋 Step 2: Creating Country Office Organizations");
    const countryOfficeKenya = await organizationService.createOrganization({
      name: "UNICEF Kenya Country Office",
      type: OrganizationType.COUNTRY_OFFICE,
      description: "UNICEF Country Office for Kenya",
      country: "Kenya",
      region: "East Africa",
      contactEmail: "kenya@unicef.org",
      parentId: giga.id,
    });
    console.log(`✅ Created Country Office: ${countryOfficeKenya.name}`);

    const countryOfficeRwanda = await organizationService.createOrganization({
      name: "UNICEF Rwanda Country Office",
      type: OrganizationType.COUNTRY_OFFICE,
      description: "UNICEF Country Office for Rwanda",
      country: "Rwanda",
      region: "East Africa",
      contactEmail: "rwanda@unicef.org",
      parentId: giga.id,
    });
    console.log(`✅ Created Country Office: ${countryOfficeRwanda.name}`);

    // Step 3: Issue Country Office Authorization Credentials
    console.log(
      "\n📋 Step 3: Issuing Country Office Authorization Credentials"
    );
    const kenyaCountryOfficeAuthCredential =
      await credentialService.issueCredential({
        issuerDid: giga.did,
        subjectDid: countryOfficeKenya.did,
        credentialType: CredentialType.COUNTRY_OFFICE_AUTHORIZATION,
        claims: {
          authorizedRegions: ["Kenya", "East Africa"],
          validFrom: new Date().toISOString(),
          authorityLevel: "Country",
          permissions: [
            "issue_government_credentials",
            "verify_governmental_institutions",
          ],
        },
      });
    console.log(`✅ Issued Country Office Authorization to Kenya`);

    const rwandaCountryOfficeAuthCredential =
      await credentialService.issueCredential({
        issuerDid: giga.did,
        subjectDid: countryOfficeRwanda.did,
        credentialType: CredentialType.COUNTRY_OFFICE_AUTHORIZATION,
        claims: {
          authorizedRegions: ["Rwanda", "East Africa"],
          validFrom: new Date().toISOString(),
          authorityLevel: "Country",
          permissions: [
            "issue_government_credentials",
            "verify_governmental_institutions",
          ],
        },
      });
    console.log(`✅ Issued Country Office Authorization to Rwanda`);

    // Step 4: Create Government organizations
    console.log("\n📋 Step 4: Creating Government Organizations");
    const govKenya = await organizationService.createOrganization({
      name: "Ministry of Education Kenya",
      type: OrganizationType.GOVERNMENT,
      description: "Government of Kenya Ministry of Education",
      country: "Kenya",
      region: "East Africa",
      contactEmail: "education@gov.ke",
      parentId: countryOfficeKenya.id,
    });
    console.log(`✅ Created Government: ${govKenya.name}`);

    const govRwanda = await organizationService.createOrganization({
      name: "Ministry of Education Rwanda",
      type: OrganizationType.GOVERNMENT,
      description: "Government of Rwanda Ministry of Education",
      country: "Rwanda",
      region: "East Africa",
      contactEmail: "education@gov.rw",
      parentId: countryOfficeRwanda.id,
    });
    console.log(`✅ Created Government: ${govRwanda.name}`);

    const govNigeria = await organizationService.createOrganization({
      name: "Ministry of Education Nigeria",
      type: OrganizationType.GOVERNMENT,
      description: "Government of Nigeria Ministry of Education",
      country: "Nigeria",
      region: "West Africa",
      contactEmail: "education@gov.ng",
      parentId: countryOfficeKenya.id,
    });
    console.log(`✅ Created Government: ${govNigeria.name}`);

    // Step 5: Issue Government Authorization Credentials
    console.log("\n📋 Step 5: Issuing Government Authorization Credentials");

    const kenyaAuthCredential = await credentialService.issueCredential({
      issuerDid: countryOfficeKenya.did,
      subjectDid: govKenya.did,
      credentialType: CredentialType.GOVERNMENT_AUTHORIZATION,
      claims: {
        authorizedRegions: ["Kenya", "East Africa"],
        validFrom: new Date().toISOString(),
        authorityLevel: "National",
        permissions: [
          "issue_school_credentials",
          "verify_educational_institutions",
        ],
      },
    });
    console.log(`✅ Issued Government Authorization to Kenya`);

    const rwandaAuthCredential = await credentialService.issueCredential({
      issuerDid: countryOfficeRwanda.did,
      subjectDid: govRwanda.did,
      credentialType: CredentialType.GOVERNMENT_AUTHORIZATION,
      claims: {
        authorizedRegions: ["Rwanda", "East Africa"],
        validFrom: new Date().toISOString(),
        authorityLevel: "National",
        permissions: [
          "issue_school_credentials",
          "verify_educational_institutions",
        ],
      },
    });
    console.log(`✅ Issued Government Authorization to Rwanda`);

    const nigeriaAuthCredential = await credentialService.issueCredential({
      issuerDid: countryOfficeKenya.did,
      subjectDid: govNigeria.did,
      credentialType: CredentialType.GOVERNMENT_AUTHORIZATION,
      claims: {
        authorizedRegions: ["Nigeria", "West Africa"],
        validFrom: new Date().toISOString(),
        authorityLevel: "National",
        permissions: [
          "issue_school_credentials",
          "verify_educational_institutions",
        ],
      },
    });
    console.log(`✅ Issued Government Authorization to Nigeria`);

    // Step 6: Create School organizations
    console.log("\n📋 Step 6: Creating School Organizations");

    // Kenya Schools
    const schoolNairobi = await organizationService.createOrganization({
      name: "Nairobi Primary School",
      type: OrganizationType.SCHOOL,
      description: "Primary school in Nairobi, Kenya",
      country: "Kenya",
      region: "Nairobi",
      contactEmail: "admin@nairobiprimary.ke",
      parentId: govKenya.id,
    });
    console.log(`✅ Created School: ${schoolNairobi.name}`);

    const schoolMombasa = await organizationService.createOrganization({
      name: "Mombasa Secondary School",
      type: OrganizationType.SCHOOL,
      description: "Secondary school in Mombasa, Kenya",
      country: "Kenya",
      region: "Mombasa",
      contactEmail: "admin@mombasasecondary.ke",
      parentId: govKenya.id,
    });
    console.log(`✅ Created School: ${schoolMombasa.name}`);

    // Rwanda Schools
    const schoolKigali = await organizationService.createOrganization({
      name: "Kigali Secondary School",
      type: OrganizationType.SCHOOL,
      description: "Secondary school in Kigali, Rwanda",
      country: "Rwanda",
      region: "Kigali",
      contactEmail: "admin@kigalisecondary.rw",
      parentId: govRwanda.id,
    });
    console.log(`✅ Created School: ${schoolKigali.name}`);

    // Nigeria Schools
    const schoolLagos = await organizationService.createOrganization({
      name: "Lagos International School",
      type: OrganizationType.SCHOOL,
      description: "International school in Lagos, Nigeria",
      country: "Nigeria",
      region: "Lagos",
      contactEmail: "admin@lagosinternational.ng",
      parentId: govNigeria.id,
    });
    console.log(`✅ Created School: ${schoolLagos.name}`);

    // Step 7: Issue School Authorization Credentials
    console.log("\n📋 Step 7: Issuing School Authorization Credentials");

    await credentialService.issueCredential({
      issuerDid: govKenya.did,
      subjectDid: schoolNairobi.did,
      credentialType: CredentialType.SCHOOL_AUTHORIZATION,
      claims: {
        schoolType: "Primary",
        accreditationLevel: "Full",
        validFrom: new Date().toISOString(),
        studentCapacity: 500,
        authorizedGrades: ["1", "2", "3", "4", "5", "6", "7", "8"],
        permissions: [
          "issue_student_credentials",
          "academic_records",
          "attendance_tracking",
        ],
      },
    });
    console.log(`✅ Issued School Authorization to Nairobi Primary School`);

    await credentialService.issueCredential({
      issuerDid: govKenya.did,
      subjectDid: schoolMombasa.did,
      credentialType: CredentialType.SCHOOL_AUTHORIZATION,
      claims: {
        schoolType: "Secondary",
        accreditationLevel: "Full",
        validFrom: new Date().toISOString(),
        studentCapacity: 800,
        authorizedGrades: ["9", "10", "11", "12"],
        permissions: [
          "issue_student_credentials",
          "academic_records",
          "graduation_diplomas",
        ],
      },
    });
    console.log(`✅ Issued School Authorization to Mombasa Secondary School`);

    await credentialService.issueCredential({
      issuerDid: govRwanda.did,
      subjectDid: schoolKigali.did,
      credentialType: CredentialType.SCHOOL_AUTHORIZATION,
      claims: {
        schoolType: "Secondary",
        accreditationLevel: "Full",
        validFrom: new Date().toISOString(),
        studentCapacity: 600,
        authorizedGrades: ["9", "10", "11", "12"],
        permissions: [
          "issue_student_credentials",
          "academic_records",
          "graduation_diplomas",
        ],
      },
    });
    console.log(`✅ Issued School Authorization to Kigali Secondary School`);

    await credentialService.issueCredential({
      issuerDid: govNigeria.did,
      subjectDid: schoolLagos.did,
      credentialType: CredentialType.SCHOOL_AUTHORIZATION,
      claims: {
        schoolType: "International",
        accreditationLevel: "Premium",
        validFrom: new Date().toISOString(),
        studentCapacity: 1000,
        authorizedGrades: [
          "K",
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "10",
          "11",
          "12",
        ],
        permissions: [
          "issue_student_credentials",
          "academic_records",
          "international_certificates",
          "graduation_diplomas",
        ],
      },
    });
    console.log(`✅ Issued School Authorization to Lagos International School`);

    // Step 8: Create sample student credentials
    console.log("\n📋 Step 8: Creating Sample Student Credentials");

    // Create sample student DIDs
    const student1 = await agent.didManagerCreate({
      provider: "did:ethr",
      alias: "student-alice-johnson",
    });

    const student2 = await agent.didManagerCreate({
      provider: "did:ethr",
      alias: "student-bob-smith",
    });

    const student3 = await agent.didManagerCreate({
      provider: "did:ethr",
      alias: "student-carol-williams",
    });

    console.log(`✅ Created student DIDs`);

    // Issue student enrollment credentials
    await credentialService.issueCredential({
      issuerDid: schoolNairobi.did,
      subjectDid: student1.did,
      credentialType: CredentialType.STUDENT_ENROLLMENT,
      claims: {
        studentName: "Alice Johnson",
        studentId: "NPS2024001",
        grade: "6",
        academicYear: "2024",
        enrollmentDate: new Date().toISOString(),
        guardianName: "Mary Johnson",
        guardianContact: "+254700123456",
      },
    });

    await credentialService.issueCredential({
      issuerDid: schoolKigali.did,
      subjectDid: student2.did,
      credentialType: CredentialType.STUDENT_ENROLLMENT,
      claims: {
        studentName: "Bob Smith",
        studentId: "KSS2024001",
        grade: "10",
        academicYear: "2024",
        enrollmentDate: new Date().toISOString(),
        guardianName: "John Smith",
        guardianContact: "+250788123456",
      },
    });

    // Issue academic achievement credentials
    await credentialService.issueCredential({
      issuerDid: schoolNairobi.did,
      subjectDid: student1.did,
      credentialType: CredentialType.INFORMATION_WORKER,
      claims: {
        workerName: "Alice Johnson",
        workerId: "NPS2024001",
      },
    });

    await credentialService.issueCredential({
      issuerDid: schoolLagos.did,
      subjectDid: student3.did,
      credentialType: CredentialType.GRADUATION_DIPLOMA,
      claims: {
        studentName: "Carol Williams",
        studentId: "LIS2024001",
        graduationDate: new Date().toISOString(),
        degree: "High School Diploma",
        honors: "Summa Cum Laude",
        gpa: "3.95",
        specialization: "Science and Technology",
      },
    });

    console.log(`✅ Issued sample student credentials`);

    // Cleanup: Close database connection
    await dbConnection.destroy();
    console.log("🔌 Database connection closed");

    console.log("\n🎉 Database Seeding Complete!");
    console.log("=".repeat(60));
    console.log("📊 Summary of created data:");
    console.log("   • 1 Giga organization (root authority)");
    console.log("   • 3 Government organizations (Kenya, Rwanda, Nigeria)");
    console.log("   • 4 School organizations");
    console.log("   • 7 Authorization credentials");
    console.log("   • 4 Student credentials");
    console.log("   • Complete hierarchical structure ready for testing");
    console.log("\n🚀 You can now start the server with: npm run dev");
    console.log("🌐 Visit: http://localhost:3000/hierarchy-test");
  } catch (error) {
    console.error("❌ Database seeding failed:", error);
    process.exit(1);
  }
}

// Run the seeding if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase()
    .then(() => {
      console.log("✅ Seeding completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("❌ Seeding failed:", error);
      process.exit(1);
    });
}

export { seedDatabase };
