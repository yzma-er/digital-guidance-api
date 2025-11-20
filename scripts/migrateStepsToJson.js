const pool = require("../db");

(async () => {
  try {
    const [services] = await pool.query("SELECT service_id, content FROM services");

    for (const service of services) {
      let parsedSteps = [];
      const rawContent = service.content || ""; // ✅ prevents null/undefined crash

      try {
        // ✅ If already JSON, parse it
        parsedSteps = JSON.parse(rawContent);
        if (!Array.isArray(parsedSteps)) throw new Error("Not an array");
      } catch {
        // ✅ Convert plain text into structured steps
        const regex = /Step\s*\d+[:.-]?\s*(.*?)(?=(Step\s*\d+[:.-]|$))/gis;
        let match;

        while ((match = regex.exec(rawContent)) !== null) {
          parsedSteps.push({
            title: `Step ${parsedSteps.length + 1}`,
            content: match[1].trim(),
          });
        }

        // ✅ Fallback if no steps were found
        if (parsedSteps.length === 0 && rawContent.trim() !== "") {
          parsedSteps = [{ title: "Step 1", content: rawContent.trim() }];
        }
      }

      // ✅ Skip update if nothing to save
      if (parsedSteps.length === 0) continue;

      await pool.query("UPDATE services SET content = ? WHERE service_id = ?", [
        JSON.stringify(parsedSteps),
        service.service_id,
      ]);
    }

    console.log("✅ Migration complete! All service contents are now safely JSON-based.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
})();
