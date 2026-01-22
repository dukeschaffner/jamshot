/**
 * Local execution support
 */
import { processEmailNotifications } from './index.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory path in ESM
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables first, before importing db config
if (!process.env.DB_HOST) {
    dotenv.config({ path: path.join(__dirname, '.env') });
}


const args = process.argv.slice(2);
let forcePeriods = null;

if (args.length > 0) {
const validPeriods = ['daily', 'weekly', 'monthly'];
forcePeriods = args.filter(arg => validPeriods.includes(arg));
if (forcePeriods.length === 0) {
    console.log('Usage: node local.js [daily] [weekly] [monthly]');
    console.log('Examples:');
    console.log('  node local.js              # Run based on current date');
    console.log('  node local.js daily        # Force daily emails only');
    console.log('  node local.js weekly       # Force weekly emails only');
    console.log('  node local.js daily weekly # Force both daily and weekly');
    process.exit(1);
}
}

// Run the function
processEmailNotifications(forcePeriods)
.then(result => {
    console.log('Local execution completed:', result);
    process.exit(0);
})
.catch(error => {
    console.error('Local execution failed:', error);
    process.exit(1);
});
