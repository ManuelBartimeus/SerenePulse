import { Outlet } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { PageTabs, type PageTab } from '../features/cases/page-tabs';
import { PageHeader, SubPageContext } from './shell';

/**
 * One page with link tabs (each tab keeps its own address, so links and the browser's Back button
 * work). The tab's own PageHeader becomes a section heading under this page's title.
 */
export function TabbedPage({
  title,
  subtitle,
  tabs,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  tabs: PageTab[];
  children?: ReactNode;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <PageTabs tabs={tabs} label={title} />
      <SubPageContext.Provider value={true}>{children ?? <Outlet />}</SubPageContext.Provider>
    </>
  );
}
