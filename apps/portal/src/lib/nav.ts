/** A navigation entry. Items whose permission the user lacks are not shown (REQ §19). */
export interface NavItem {
  to: string;
  label: string;
  /** Shown when the user has any of these permissions. */
  permission?: string | string[];
  group?: 'insights' | 'operations' | 'admin';
}
