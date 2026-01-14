const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:'); // RAM üzerinde çalışır (Hızlı test için)

// RENKLİ KONSOL AYARLARI
const colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    green: "\x1b[32m",
    red: "\x1b[31m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m"
};

console.log(colors.cyan + "\n==================================================");
console.log("🚀 STARTING DATABASE PERFORMANCE EXPERIMENT");
console.log("==================================================" + colors.reset);

db.serialize(() => {
    // 1. Tablo Oluştur
    db.run("CREATE TABLE points (id INTEGER PRIMARY KEY, lat REAL, lng REAL, name TEXT)");

    // 2. 100.000 Veri Ekle
    console.log(colors.blue + "\n📊 Generating 100,000 random spatial points..." + colors.reset);
    const stmt = db.prepare("INSERT INTO points (lat, lng, name) VALUES (?, ?, ?)");
    
    db.parallelize(() => {
        for (let i = 0; i < 100000; i++) {
            let lat = (Math.random() * 180) - 90;
            let lng = (Math.random() * 360) - 180;
            stmt.run(lat, lng, `Point_${i}`);
        }
    });
    stmt.finalize(() => {
        console.log(colors.green + "✅ Data insertion completed successfully." + colors.reset);
        startExperiment();
    });
});

function startExperiment() {
    const queryLat = 41.00; // İstanbul civarı arama

    // TEST 1: İNDEKSSİZ ARAMA
    console.log(colors.cyan + "\n🔍 Running Query 1: Full Table Scan (No Index)..." + colors.reset);
    const start1 = process.hrtime();
    
    db.all("SELECT * FROM points WHERE lat BETWEEN ? AND ?", [queryLat - 1, queryLat + 1], (err, rows) => {
        const end1 = process.hrtime(start1);
        const time1 = (end1[0] * 1000 + end1[1] / 1e6).toFixed(2);
        
        console.log(colors.red + `❌ Time WITHOUT Index: ${time1} ms` + colors.reset);
        console.log(`   (Rows found: ${rows.length})`);

        // İNDEKS OLUŞTURMA
        console.log(colors.yellow + "\n⚙️ Creating B-Tree Index on 'lat' column..." + colors.reset);
        const startIndex = process.hrtime();
        
        db.run("CREATE INDEX idx_lat ON points(lat)", () => {
            const endIndex = process.hrtime(startIndex);
            console.log(colors.green + `✅ Index created in ${(endIndex[0] * 1000 + endIndex[1] / 1e6).toFixed(2)} ms` + colors.reset);

            // TEST 2: İNDEKSLİ ARAMA
            console.log(colors.cyan + "\n🔍 Running Query 2: Indexed Search..." + colors.reset);
            const start2 = process.hrtime();
            
            db.all("SELECT * FROM points WHERE lat BETWEEN ? AND ?", [queryLat - 1, queryLat + 1], (err, rows2) => {
                const end2 = process.hrtime(start2);
                const time2 = (end2[0] * 1000 + end2[1] / 1e6).toFixed(2);
                
                console.log(colors.green + `✅ Time WITH Index:    ${time2} ms` + colors.reset);

                // SONUÇ RAPORU
                printReport(time1, time2);
            });
        });
    });
}

function printReport(t1, t2) {
    console.log(colors.cyan + "\n==================================================");
    console.log("📢 EXPERIMENT RESULTS REPORT");
    console.log("==================================================" + colors.reset);
    console.log(`Dataset Size:    100,000 rows`);
    console.log(`Query Type:      Range Scan (BETWEEN)`);
    console.log("--------------------------------------------------");
    console.log(`Execution (No Index):  ${t1} ms`);
    console.log(`Execution (With Index): ${t2} ms`);
    console.log("--------------------------------------------------");
    
    let gain = (t1 / t2).toFixed(1);
    console.log(colors.bright + colors.white + `🚀 PERFORMANCE GAIN: ${gain}x FASTER!` + colors.reset);
    console.log(colors.cyan + "==================================================\n" + colors.reset);
}