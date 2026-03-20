/**
 * Simulation Account Database Initialization Module
 * Stock Monitoring System
 *
 * This module handles database initialization, schema creation,
 * and migration management for the simulation account system.
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');

// Configuration
const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'simulation_accounts.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// Database connection instance
let dbInstance = null;

/**
 * Ensure database directory exists
 * @returns {Promise<void>}
 */
async function ensureDirectory() {
    try {
        await fs.mkdir(DB_DIR, { recursive: true });
        await fs.mkdir(MIGRATIONS_DIR, { recursive: true });
    } catch (err) {
        console.error('Failed to create directories:', err);
        throw err;
    }
}

/**
 * Create database connection
 * @returns {sqlite3.Database}
 */
function createConnection() {
    if (dbInstance) return dbInstance;

    dbInstance = new sqlite3.Database(DB_PATH, (err) => {
        if (err) {
            console.error('Database connection failed:', err.message);
            throw err;
        }
        console.log('Connected to simulation accounts database:', DB_PATH);
    });

    // Enable foreign keys
    dbInstance.run('PRAGMA foreign_keys = ON');

    // Enable WAL mode for better concurrency
    dbInstance.run('PRAGMA journal_mode = WAL');

    // Add Promise-based methods
    extendWithPromises(dbInstance);

    return dbInstance;
}

/**
 * Extend database instance with Promise-based methods
 * @param {sqlite3.Database} db
 */
function extendWithPromises(db) {
    /**
     * Execute SQL with all results
     */
    db.allAsync = function(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    };

    /**
     * Execute SQL with single result
     */
    db.getAsync = function(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    };

    /**
     * Execute SQL without results
     */
    db.runAsync = function(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ lastID: this.lastID, changes: this.changes });
            });
        });
    };

    /**
     * Execute multiple statements
     */
    db.execAsync = function(sql) {
        return new Promise((resolve, reject) => {
            this.exec(sql, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    };

    /**
     * Begin transaction
     */
    db.beginTransaction = function() {
        return this.runAsync('BEGIN TRANSACTION');
    };

    /**
     * Commit transaction
     */
    db.commit = function() {
        return this.runAsync('COMMIT');
    };

    /**
     * Rollback transaction
     */
    db.rollback = function() {
        return this.runAsync('ROLLBACK');
    };
}

/**
 * Execute schema SQL file
 * @param {sqlite3.Database} db
 * @returns {Promise<void>}
 */
async function executeSchema(db) {
    try {
        const schema = await fs.readFile(SCHEMA_PATH, 'utf8');
        await db.execAsync(schema);
        console.log('Schema executed successfully');
    } catch (err) {
        console.error('Schema execution failed:', err);
        throw err;
    }
}

/**
 * Run pending migrations
 * @param {sqlite3.Database} db
 * @returns {Promise<void>}
 */
async function runMigrations(db) {
    // Create migrations tracking table
    await db.runAsync(`
        CREATE TABLE IF NOT EXISTS _migrations (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            filename    VARCHAR(255) NOT NULL UNIQUE,
            executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            checksum    VARCHAR(64)
        )
    `);

    try {
        // Get list of migration files
        const files = await fs.readdir(MIGRATIONS_DIR);
        const migrationFiles = files
            .filter(f => f.endsWith('.sql'))
            .sort();

        // Get executed migrations
        const executed = await db.allAsync('SELECT filename FROM _migrations');
        const executedSet = new Set(executed.map(e => e.filename));

        // Run pending migrations
        for (const file of migrationFiles) {
            if (!executedSet.has(file)) {
                const filepath = path.join(MIGRATIONS_DIR, file);
                const sql = await fs.readFile(filepath, 'utf8');

                await db.execAsync(sql);
                await db.runAsync(
                    'INSERT INTO _migrations (filename, checksum) VALUES (?, ?)',
                    [file, '']
                );

                console.log(`Migration executed: ${file}`);
            }
        }
    } catch (err) {
        console.error('Migration failed:', err);
        throw err;
    }
}

/**
 * Initialize database (create schema and run migrations)
 * @returns {Promise<sqlite3.Database>}
 */
async function initialize() {
    try {
        await ensureDirectory();
        const db = createConnection();
        await executeSchema(db);
        await runMigrations(db);
        console.log('Database initialization completed');
        return db;
    } catch (err) {
        console.error('Database initialization failed:', err);
        throw err;
    }
}

/**
 * Get database connection (initialize if needed)
 * @returns {Promise<sqlite3.Database>}
 */
async function getConnection() {
    if (!dbInstance) {
        return await initialize();
    }
    return dbInstance;
}

/**
 * Close database connection
 * @returns {Promise<void>}
 */
async function close() {
    if (dbInstance) {
        await new Promise((resolve, reject) => {
            dbInstance.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        dbInstance = null;
        console.log('Database connection closed');
    }
}

// Module exports
module.exports = {
    initialize,
    getConnection,
    close,
    DB_PATH,
    DB_DIR
};
