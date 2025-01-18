db.createUser({
    user: process.env.MONGO_INITDB_ROOT_USERNAME,
    pwd: process.env.MONGO_INITDB_ROOT_PASSWORD,
    roles: [
        {
            role: "readWrite",
            db: process.env.MONGO_INITDB_DATABASE
        }
    ]
});

// Create collections for Agenda
db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE);
db.createCollection('jobs');
db.jobs.createIndex({ nextRunAt: 1, lastRunAt: 1, lastFinishedAt: 1 });
db.jobs.createIndex({ name: 1, nextRunAt: 1, lastRunAt: 1, lastFinishedAt: 1 }); 