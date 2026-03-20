/**
 * Test script for simulation account database
 * Run: node database/test.js
 */

const { initialize, getConnection, close, DB_PATH } = require('./init');

async function runTests() {
    console.log('='.repeat(60));
    console.log('Simulation Account Database Tests');
    console.log('='.repeat(60));

    try {
        // Test 1: Initialize database
        console.log('\n[Test 1] Initializing database...');
        const db = await initialize();
        console.log('✓ Database initialized successfully');

        // Test 2: Check default account
        console.log('\n[Test 2] Checking default account...');
        const account = await db.getAsync('SELECT * FROM accounts WHERE id = 1');
        if (account) {
            console.log('✓ Default account found:', account.name);
            console.log('  Initial Capital:', account.initial_capital);
            console.log('  Current Capital:', account.current_capital);
        } else {
            console.log('✗ Default account not found');
        }

        // Test 3: Check monitoring strategies
        console.log('\n[Test 3] Checking monitoring strategies...');
        const strategies = await db.allAsync('SELECT * FROM monitoring_strategies');
        console.log('✓ Found', strategies.length, 'monitoring strategies');
        strategies.forEach(s => {
            console.log(`  - ${s.stock_code}: ${s.strategy_type} (${s.status})`);
        });

        // Test 4: Test CRUD operations
        console.log('\n[Test 4] Testing CRUD operations...');

        // Create new account
        const newAccount = await db.runAsync(
            `INSERT INTO accounts (name, initial_capital, current_capital, status)
             VALUES (?, ?, ?, ?)`,
            ['Test Account', 500000, 500000, 'ACTIVE']
        );
        console.log('✓ Created account with ID:', newAccount.lastID);

        // Read account
        const readAccount = await db.getAsync(
            'SELECT * FROM accounts WHERE id = ?',
            [newAccount.lastID]
        );
        console.log('✓ Read account:', readAccount.name);

        // Update account
        await db.runAsync(
            'UPDATE accounts SET name = ? WHERE id = ?',
            ['Updated Test Account', newAccount.lastID]
        );
        console.log('✓ Updated account name');

        // Delete account
        await db.runAsync(
            'DELETE FROM accounts WHERE id = ?',
            [newAccount.lastID]
        );
        console.log('✓ Deleted test account');

        // Test 5: Test position operations
        console.log('\n[Test 5] Testing position operations...');

        // Create position for default account
        const position = await db.runAsync(
            `INSERT INTO positions
             (account_id, stock_code, stock_name, quantity, avg_price, current_price, market_value)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [1, '00700', 'Tencent Holdings', 1000, 380.00, 390.00, 390000.00]
        );
        console.log('✓ Created position with ID:', position.lastID);

        // Read position
        const readPosition = await db.getAsync(
            'SELECT * FROM positions WHERE id = ?',
            [position.lastID]
        );
        console.log('✓ Position:', readPosition.stock_code, 'x', readPosition.quantity);

        // Clean up
        await db.runAsync('DELETE FROM positions WHERE id = ?', [position.lastID]);
        console.log('✓ Cleaned up test position');

        // Test 6: Test trade recording
        console.log('\n[Test 6] Testing trade recording...');

        const trade = await db.runAsync(
            `INSERT INTO trades
             (account_id, stock_code, stock_name, trade_type, quantity, price,
              total_amount, fees, tax, trade_date, trade_time, order_source)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [1, '00700', 'Tencent Holdings', 'BUY', 1000, 380.00,
             380000.00, 950.00, 0.00, '2026-03-19', '10:30:00', 'MANUAL']
        );
        console.log('✓ Recorded trade with ID:', trade.lastID);

        // Clean up
        await db.runAsync('DELETE FROM trades WHERE id = ?', [trade.lastID]);
        console.log('✓ Cleaned up test trade');

        // Test 7: Verify views
        console.log('\n[Test 7] Testing database views...');

        const accountSummary = await db.allAsync('SELECT * FROM vw_account_summary LIMIT 1');
        console.log('✓ Account summary view:', accountSummary.length, 'rows');

        const activeStrategies = await db.allAsync('SELECT * FROM vw_active_strategies');
        console.log('✓ Active strategies view:', activeStrategies.length, 'rows');

        // Final summary
        console.log('\n' + '='.repeat(60));
        console.log('All tests completed successfully!');
        console.log('='.repeat(60));
        console.log('Database path:', DB_PATH);

    } catch (err) {
        console.error('\n✗ Test failed:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        await close();
    }
}

// Run tests if executed directly
if (require.main === module) {
    runTests();
}

module.exports = { runTests };
