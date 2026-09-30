/**
 * The reserved, undeliverable domain every sandbox user's address is on (see
 * supabase/demo/template.sql for the template users; `createSandbox` makes
 * the rest). Nothing sent to it can reach a real inbox, and the database
 * locks the address and phone of these users (`lock_demo_user_contact`), so
 * a visitor cannot move one to a domain of their own. The migration writes
 * the same domain literally, in that trigger and in the stray-user sweep.
 */
export const DEMO_EMAIL_DOMAIN = "demo.clientdesk.invalid";
