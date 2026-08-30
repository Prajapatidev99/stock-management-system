import { redirect } from 'next/navigation';

/**
 * Registration is disabled — this system uses a single pre-seeded admin account.
 * Anyone visiting /register is redirected to the login page.
 */
export default function RegisterPage() {
  redirect('/login');
}
