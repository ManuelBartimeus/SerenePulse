import { createRoute, type AnyRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { NavItem } from '../../lib/nav';
import { RequirePerm } from '../../lib/require-perm';
import { FeedbackFormPage, SmsGuidePage } from './access';
import { CataloguesPage } from './catalogues';
import { DirectoryPage } from './directory';
import { QrPointsPage } from './qr-points';
import { SettingsPage } from './settings';
import { SurveyVersionPage } from './survey/editor';
import { SurveyVersionsPage } from './survey/versions';

const FEEDBACK_FORM_PERMS = ['config.qr_points', 'survey.edit', 'analytics.view'];
const SMS_GUIDE_PERMS = ['config.qr_points', 'survey.edit', 'analytics.view'];
const SURVEY_PERMS = ['survey.edit', 'survey.publish.approve'];

const guarded = (permission: string | string[], page: () => ReactNode) => () => (
  <RequirePerm permission={permission}>{page()}</RequirePerm>
);

/** Routes for the config feature area, mounted under the signed-in shell (router basepath /admin). */
export function configRoutes(parent: AnyRoute): AnyRoute[] {
  const r = (path: string, permission: string | string[], page: () => ReactNode) =>
    createRoute({ getParentRoute: () => parent, path, component: guarded(permission, page) });
  return [
    r('/config/feedback-form', FEEDBACK_FORM_PERMS, () => <FeedbackFormPage />),
    r('/config/qr-points', 'config.qr_points', () => <QrPointsPage />),
    r('/config/sms-link', SMS_GUIDE_PERMS, () => <SmsGuidePage />),
    r('/config/survey', SURVEY_PERMS, () => <SurveyVersionsPage />),
    r('/config/survey/$versionId', SURVEY_PERMS, () => <SurveyVersionPage />),
    r('/config/directory', 'config.directory', () => <DirectoryPage />),
    r('/config/catalogues', 'config.catalogues', () => <CataloguesPage />),
    r('/config/settings', 'settings.manage', () => <SettingsPage />),
  ];
}

export const configNav: NavItem[] = [
  {
    to: '/config/feedback-form',
    label: 'Feedback form',
    permission: FEEDBACK_FORM_PERMS,
    group: 'operations',
  },
  { to: '/config/qr-points', label: 'QR points', permission: 'config.qr_points', group: 'operations' },
  { to: '/config/sms-link', label: 'SMS link guide', permission: SMS_GUIDE_PERMS, group: 'operations' },
  { to: '/config/survey', label: 'Survey versions', permission: SURVEY_PERMS, group: 'admin' },
  { to: '/config/directory', label: 'Branches & regions', permission: 'config.directory', group: 'admin' },
  { to: '/config/catalogues', label: 'Catalogues', permission: 'config.catalogues', group: 'admin' },
  { to: '/config/settings', label: 'Settings', permission: 'settings.manage', group: 'admin' },
];
