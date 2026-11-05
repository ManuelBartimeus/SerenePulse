import { createRoute, type AnyRoute } from '@tanstack/react-router';
import type { NavItem } from '../../lib/nav';
import { HomePage } from './overview';

/** Routes for dashboards and feedback records. This area owns "/" (the overview). */
export function analyticsRoutes(parent: AnyRoute): AnyRoute[] {
  return [createRoute({ getParentRoute: () => parent, path: '/', component: HomePage })];
}

export const analyticsNav: NavItem[] = [{ to: '/', label: 'Overview' }];
