import { createRoute, type AnyRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { RequirePerm } from '../../lib/require-perm';
import { PERMS } from '../../pages/shell';
import { FeedbackFormPage } from './access';
import { CataloguesPage } from './catalogues';
import { DirectoryPage } from './directory';
import { SurveyVersionPage } from './survey/editor';
import { SurveyVersionsPage } from './survey/versions';

const guarded = (permission: string | string[], page: () => ReactNode) => () => (
  <RequirePerm permission={permission}>{page()}</RequirePerm>
);

/** Routes for the config feature area, mounted under the signed-in shell (router basepath /admin). */
export function configRoutes(parent: AnyRoute): AnyRoute[] {
  const r = (path: string, permission: string | string[], page: () => ReactNode) =>
    createRoute({ getParentRoute: () => parent, path, component: guarded(permission, page) });
  return [
    r('/config/feedback-form', PERMS.feedbackForm, () => <FeedbackFormPage />),
    r('/config/survey', PERMS.survey, () => <SurveyVersionsPage />),
    r('/config/survey/$versionId', PERMS.survey, () => <SurveyVersionPage />),
    r('/config/directory', PERMS.directory, () => <DirectoryPage />),
    r('/config/catalogues', PERMS.catalogues, () => <CataloguesPage />),
  ];
}
