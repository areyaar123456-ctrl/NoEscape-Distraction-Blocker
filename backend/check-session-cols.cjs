const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
    try {
        const columns = await prisma.
            SELECT column_name, table_name 
            FROM information_schema.columns 
            WHERE table_name IN ('Session', 'Blocklist');
        ;
        console.log('---COLUMNS---');
        console.log(JSON.stringify(columns, null, 2));
    } catch (err) {
        console.error('FAIL:' + err.message);
    }
    process.exit(0);
}
run();
