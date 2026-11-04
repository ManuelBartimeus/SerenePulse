# Insurance Customer Feedback System

## Business and Functional Requirements Document

**Version:** 1.0\
**Purpose:** Define the requirements for a lightweight customer feedback
system that captures actionable insurance customer-experience data and
supports organization-wide and branch-level decision-making.

------------------------------------------------------------------------

## 1. Project Overview

The system will collect customer feedback after an insurance policy or
transaction has been completed. It must provide management with reliable
information about customer satisfaction, service channels, issuing
branches, insurance products, and areas requiring operational
improvement.

The system has two main interfaces:

1.  **Customer feedback portal:** A short, mobile-first, multi-page
    survey that customers can complete in 60 seconds or less.
2.  **Administrative portal:** An analytics and feedback-management
    interface for executives, branch managers, customer-experience
    teams, and system administrators.

### 1.1 Primary objectives

-   Measure overall customer satisfaction.
-   Compare customer experience across branches.
-   Compare digital, physical, telephone, and intermediary service
    channels.
-   Understand satisfaction across insurance products.
-   Identify common sources of dissatisfaction.
-   Monitor customer experience trends over time.
-   Enable authorized staff to review and resolve feedback requiring
    attention.
-   Give executives evidence to support operational and administrative
    decisions.

### 1.2 Core design constraint

The customer survey must be designed for completion in **60 seconds or
less**.

The preferred median completion time is 40 seconds or less. The survey
must collect only high-value information, use predefined responses
wherever possible, avoid mandatory free-text fields, and minimize
typing.

### 1.3 Important operating assumption

The company cannot reliably determine from its existing systems:

-   Which branch issued the customer's policy.
-   Which channel the customer used to obtain the policy.
-   Which insurance product the customer purchased.

These details must therefore be collected from the customer. They must
not be assumed or silently inferred.

------------------------------------------------------------------------

## 2. Customer Survey Experience

### 2.1 Survey delivery and access

-   Each eligible customer must receive a unique feedback link after the
    relevant insurance transaction is completed via SMS/Whatsapp or scanning a QQR code.
-   The link must open the survey directly without requiring account
    creation or login.
-   The link must contain a secure, non-guessable token.
-   The system must associate the invitation with a unique invitation
    record.
-   The system must prevent more than one valid submission per
    invitation.
-   The system must support configurable invitation expiry.
-   The customer must be able to complete the survey on a mobile phone,
    tablet, or desktop.
-   The survey must be responsive and usable on slower network
    connections.
-   The customer must receive a clear confirmation after successful
    submission.

### 2.2 Survey structure

The survey will use five main pages:

1.  Transaction information.
2.  Overall satisfaction.
3.  Ease of service.
4.  Recommendation likelihood.
5.  Additional feedback and submission.

Page 1 groups three related transaction-identification questions. Pages
2, 3, and 4 each contain one rating question. Page 5 is optional apart
from the final submission action.

### 2.3 Navigation requirements

**Single-choice pages (Pages 2--4):**

-   Selecting an answer must save the selection in the current survey
    session.
-   The interface must immediately advance to the next page after
    selection.
-   A Continue button should not be required on these pages.
-   A brief visual selection confirmation may be used to prevent
    accidental selections.
-   The transition must be responsive and must not feel abrupt.

**Transaction information page (Page 1):**

-   The three transaction-identification questions must remain on the
    same page.
-   Selecting the service channel must reveal or hide the relevant
    branch field as appropriate.
-   The customer must complete all applicable required fields before
    proceeding.
-   A clearly visible Continue action should advance to Page 2 once the
    required fields are complete.

**Additional feedback page (Page 5):**

-   The customer may select an improvement factor.
-   The customer may enter an optional comment.
-   The customer must be able to skip optional feedback and submit.
-   The final submission action must prevent duplicate submissions.

**Back navigation:**

-   Every page after Page 1 must have a visible Back control.
-   Previously selected answers must remain populated when navigating
    backwards.
-   Previously entered comments must remain intact.
-   Changing a previous answer must update the existing session response
    rather than create a duplicate.
-   The customer must be able to move forward again without losing other
    answers.

**Progress indication:**

-   Display a compact progress indicator throughout the survey.
-   Clearly indicate the current step and remaining steps.
-   Use a progress bar and/or step labels.
-   Keep navigation and progress information consistent across pages.

### 2.4 Page 1 --- Transaction Information

**Purpose:** Identify the channel through which the customer obtained
the policy, the issuing branch, and the insurance product.

All three questions must appear on the same page.

#### Question 1: Service channel

**Question:** How did you obtain your insurance policy?

Options:

-   Mobile application
-   Company website
-   Walk-in at a branch office
-   Telephone / call centre
-   WhatsApp
-   Insurance agent / broker
-   Other

**Requirements:**

-   This question is mandatory.
-   The customer selects one option.
-   The selected channel must be stored as a structured value.
-   If the customer selects an unlisted channel, the system may display
    a short clarification field.

#### Question 2: Issuing branch

**Question:** Which branch issued your insurance policy?

-   Display this field conditionally when the selected channel makes a
    branch relevant, particularly walk-in at a branch office.
-   For agent/broker transactions, display the branch question if the
    company associates the issuing process with a branch.
-   The branch list must be populated dynamically from the company's
    branch directory.
-   The customer must select one branch where the question is
    applicable.
-   Include an Other branch option if the company's branch directory may
    not cover all cases.
-   If Other is selected, allow a short branch clarification.
-   Do not treat the customer's location or the branch they may have
    visited as proof of the issuing branch.

**Important distinction:** The issuing branch is the branch that issued
the policy. It may differ from a branch that merely assisted the
customer. The data model should allow a separate servicing-branch field
in a future enhancement if the company needs to analyse multi-branch
customer journeys.

#### Question 3: Insurance product

**Question:** What type of insurance policy did you purchase?

Suggested options:

-   Motor insurance
-   Health insurance
-   Life insurance
-   Travel insurance
-   Property / fire insurance
-   Marine insurance
-   Business / commercial insurance
-   Other

**Requirements:**

-   This question is mandatory.
-   The product options must be configurable.
-   The customer selects one product.
-   If Other is selected, optionally display a short product-name field.
-   Product categories must be stored as structured values.

#### Page 1 validation and navigation

-   The service channel and insurance product are always required.
-   The issuing branch is required when the selected channel makes it
    applicable.
-   The branch field must appear or disappear based on the selected
    channel.
-   The Continue action must remain unavailable until all applicable
    required fields are completed.
-   Changing the channel must re-evaluate whether branch selection is
    required.
-   If a previously selected branch becomes irrelevant after the channel
    changes, the system must clear or mark it not applicable rather than
    retain misleading branch attribution.

### 2.5 Page 2 --- Overall Satisfaction

**Question:** How satisfied are you with the insurance service you
received?

Use a five-point scale:

    Score Label
  ------- -------------------
        1 Very dissatisfied
        2 Dissatisfied
        3 Neutral
        4 Satisfied
        5 Very satisfied

**Requirements:**

-   Mandatory response.
-   Display the score and descriptive label clearly.
-   Selecting an answer immediately advances to Page 3.
-   Store the response as an integer from 1 to 5.
-   This is the primary Customer Satisfaction Score (CSAT) question.

### 2.6 Page 3 --- Ease of Service

**Question:** How easy was it to obtain your insurance policy?

Use a five-point scale:

    Score Label
  ------- ----------------------------
        1 Very difficult
        2 Difficult
        3 Neither easy nor difficult
        4 Easy
        5 Very easy

**Requirements:**

-   Mandatory response.
-   Selecting an answer immediately advances to Page 4.
-   Store the response as an integer from 1 to 5.
-   Use the result to calculate the Customer Effort Score (CES).

### 2.7 Page 4 --- Recommendation Likelihood

**Question:** How likely are you to recommend our insurance company to
someone you know?

Use the standard 0--10 scale:

-   0 = Not at all likely.
-   10 = Extremely likely.

**Requirements:**

-   Mandatory response.
-   Display all values from 0 to 10.
-   Selecting a value immediately advances to Page 5.
-   Store the response as an integer from 0 to 10.
-   Use the result to calculate Net Promoter Score (NPS).

### 2.8 Page 5 --- Additional Feedback

**Question:** What is the main thing we could improve?

Suggested single-select options:

-   Speed of service
-   Staff professionalism
-   Communication and information
-   Ease of the process
-   Technical issues
-   Pricing and charges
-   Other
-   Nothing, I am satisfied

**Requirements:**

-   This page is optional.
-   The customer may select one improvement factor.
-   If Other is selected, display an optional short text field.
-   Provide an optional general comment field.
-   Do not require a comment.
-   Allow the customer to skip this page and submit.
-   Store the selected improvement factor as a structured category.
-   Store any comment separately from structured ratings.
-   A low satisfaction rating may make the page more contextually
    relevant, but must not force the customer to explain their rating.

### 2.9 Survey content and interaction limits

-   The standard survey must contain no more than five main pages.
-   The first page contains three transaction-identification questions.
-   Pages 2--4 contain one rating question each.
-   Page 5 contains optional diagnostic feedback.
-   No mandatory free-text field is permitted.
-   No login or account creation is permitted.
-   Avoid unnecessary animations, loading screens, and page reloads.
-   Use clear, concise language suitable for a broad customer audience.
-   Use touch-friendly response controls.
-   Avoid requiring the customer to enter information already captured
    in the survey session.

------------------------------------------------------------------------

## 3. Conditional Survey Logic

The survey must support conditional display rules.

  -----------------------------------------------------------------------
  Condition                           Expected behaviour
  ----------------------------------- -----------------------------------
  Customer selects Walk-in at a       Display issuing-branch selection
  branch office                       

  Customer selects Agent / broker     Display issuing-branch selection if
                                      applicable to the company's
                                      operating model

  Customer selects Mobile application Hide issuing-branch selection
                                      unless the company explicitly
                                      requires it

  Customer selects Company website    Hide issuing-branch selection
                                      unless the company explicitly
                                      requires it

  Customer selects Telephone / call   Hide issuing-branch selection
  centre                              unless the transaction was
                                      branch-issued

  Customer selects WhatsApp           Hide issuing-branch selection
                                      unless the transaction was
                                      branch-issued

  Customer selects Other channel      Optionally request a short
                                      clarification

  Customer selects Other insurance    Optionally request product name
  product                             

  Customer selects Other branch       Optionally request branch name

  Customer selects Other improvement  Display optional clarification
  factor                              field

  Customer selects Nothing, I am      Do not require an explanation
  satisfied                           
  -----------------------------------------------------------------------

The company must be able to configure which channels require a branch
selection. The initial default behaviour should be documented and
approved before implementation.

------------------------------------------------------------------------

## 4. Customer Data and Feedback Record Requirements

### 4.1 Customer-provided fields

  Field                             Required      Data type
  --------------------------------- ------------- -------------------------
  Service channel                   Yes           Enum / controlled value
  Issuing branch                    Conditional   Branch reference
  Insurance product                 Yes           Enum / controlled value
  Overall satisfaction              Yes           Integer, 1--5
  Customer effort                   Yes           Integer, 1--5
  Recommendation likelihood         Yes           Integer, 0--10
  Main improvement factor           No            Enum / controlled value
  Other improvement clarification   No            Short text
  Additional comment                No            Text

### 4.2 System-generated fields

  -----------------------------------------------------------------------
  Field                               Purpose
  ----------------------------------- -----------------------------------
  Feedback ID                         Unique response identifier

  Invitation ID                       Links response to the invitation

  Transaction reference               Links response to the insurance
                                      transaction, if available

  Customer reference                  Links response to a customer record
                                      where authorized

  Submission timestamp                Records when feedback was submitted

  Survey start timestamp              Supports completion-time
                                      measurement

  Survey completion timestamp         Supports completion-time
                                      measurement

  Completion duration                 Measures actual survey duration

  Survey version                      Identifies the questionnaire
                                      version used

  Invitation delivery channel         Records SMS, email, WhatsApp, or
                                      other delivery method

  Submission status                   Tracks completion

  Session identifier                  Supports continuity during
                                      navigation

  Issuing branch ID                   Links response to selected branch
                                      where applicable

  Service channel                     Records the customer's selected
                                      channel

  Insurance product ID                Links response to selected product
  -----------------------------------------------------------------------

### 4.3 Data integrity requirements

-   Store ratings as structured numeric values.
-   Store branch, channel, product, and issue categories as controlled
    values or foreign-key references.
-   Do not rely on free-text comments for core dashboard dimensions.
-   Preserve historical responses.
-   Do not silently overwrite submitted customer feedback.
-   Record survey versions so historical responses can be interpreted
    using the questions and scales that were in effect when submitted.
-   Distinguish between a branch that is not applicable, a branch that
    was not provided, and an unknown branch.
-   Preserve the original customer-selected channel and branch
    attribution for audit purposes.

------------------------------------------------------------------------

## 5. Survey Invitation Management

### 5.1 Invitation generation

When an eligible insurance transaction is completed:

1.  The system or an authorized integration initiates a feedback
    invitation.
2.  A unique secure token is generated.
3.  The invitation is associated with a transaction reference where
    available.
4.  The invitation is sent through the configured delivery channel.
5.  The system records the invitation status.
6.  The customer opens the link and completes the survey.

The system must not assume that the company knows the issuing branch,
service channel, or insurance product. Those values must be collected in
Page 1 unless reliable, explicitly approved data becomes available
through a future integration.

### 5.2 Invitation statuses

Support the following statuses:

-   Pending
-   Sent
-   Delivered
-   Failed
-   Opened, where measurable
-   Submitted
-   Expired
-   Cancelled

### 5.3 Duplicate prevention and repeat invitations

-   Only one valid submission may be accepted per invitation.
-   Reopening a submitted invitation must not create another response.
-   The system should support configurable invitation expiry.
-   The system should support configurable repeat-invitation rules for
    customers with multiple completed transactions.
-   Historical feedback must never be overwritten by a later survey.
-   Cancelled or incomplete transactions should be excluded according to
    configurable eligibility rules.

### 5.4 Invitation performance reporting

Track:

-   Number of invitations created.
-   Number sent.
-   Number delivered.
-   Number failed.
-   Number opened, where measurable.
-   Number submitted.
-   Number expired.
-   Invitation-to-submission conversion rate.
-   Delivery-channel performance.

------------------------------------------------------------------------

## 6. Administrative Dashboard Requirements

The administrative portal must allow authorized users to understand
customer experience at organization-wide, branch, channel, and product
levels.

### 6.1 Executive overview

The executive dashboard should display the following key performance
indicators:

  -----------------------------------------------------------------------
  KPI                                 Definition / purpose
  ----------------------------------- -----------------------------------
  Overall CSAT                        Percentage of respondents selecting
                                      4 or 5

  Average CSAT                        Mean satisfaction rating out of 5

  NPS                                 Percentage of promoters minus
                                      percentage of detractors

  Average CES                         Mean ease rating out of 5

  Total feedback received             Number of valid submitted responses

  Feedback response rate              Submitted responses divided by
                                      delivered invitations

  Negative feedback rate              Percentage of valid CSAT responses
                                      rated 1 or 2

  Main improvement factor             Most frequently selected
                                      improvement category

  Branch performance                  Comparative view of branch metrics

  Channel performance                 Comparative view of service-channel
                                      metrics

  Product performance                 Comparative view of
                                      insurance-product metrics
  -----------------------------------------------------------------------

The executive overview must show the selected reporting period and the
number of responses supporting each metric.

### 6.2 Branch performance dashboard

Executive administrators must be able to:

-   View all branches.
-   Select an individual branch.
-   Compare multiple branches.
-   Compare a branch with the company-wide average.
-   View branch satisfaction trends.
-   Filter branch metrics by insurance product.
-   Filter branch metrics by service channel.
-   Identify the most common improvement factors for each branch.
-   View response counts and sample sizes.
-   Export branch reports.

Each branch dashboard should display:

-   Branch name and region.
-   Total feedback responses.
-   CSAT.
-   NPS.
-   CES.
-   Negative feedback rate.
-   Main improvement factors.
-   Satisfaction trends over time.
-   Branch performance against organizational benchmarks.
-   Branch performance against configured targets.

A branch comparison table should support, at minimum:

  Branch               Response count   CSAT   NPS   CES
  ------------------ ---------------- ------ ----- -----
  Example Branch A                245    91%   +58   4.5
  Example Branch B                183    86%   +43   4.2
  Example Branch C                126    79%   +25   3.8

The values above are illustrative only and must never be presented as
actual company results.

### 6.3 Service-channel analytics

Support analysis of:

-   Mobile application
-   Company website
-   Walk-in at branch
-   Telephone / call centre
-   WhatsApp
-   Agent / broker
-   Other

For each channel, display:

-   Response count.
-   CSAT.
-   NPS.
-   CES.
-   Negative feedback rate.
-   Most frequently selected improvement factor.
-   Trend over time.

### 6.4 Insurance-product analytics

Support analysis of configurable insurance product categories,
including:

-   Motor insurance
-   Health insurance
-   Life insurance
-   Travel insurance
-   Property / fire insurance
-   Marine insurance
-   Business / commercial insurance
-   Other

For each product, display:

-   Response count.
-   CSAT.
-   NPS.
-   CES.
-   Negative feedback rate.
-   Main improvement factors.
-   Satisfaction trends.

### 6.5 Customer experience trends

All key metrics should be filterable by:

-   Daily
-   Weekly
-   Monthly
-   Quarterly
-   Annually
-   Custom date range

The dashboard must distinguish the date on which feedback was submitted
from the date on which the underlying insurance transaction was
completed, where both are available.

### 6.6 Customer feedback records

Authorized administrators should be able to inspect feedback records
according to their permissions.

A feedback record may show:

-   Feedback reference.
-   Submission date.
-   Service channel.
-   Issuing branch, where applicable.
-   Insurance product.
-   CSAT, CES, and NPS responses.
-   Main improvement factor.
-   Optional customer comment.
-   Case status, if a case has been created.

Personally identifiable information should be hidden from roles that do
not need it.

------------------------------------------------------------------------

## 7. Dashboard Filters

The dashboard should provide consistent filters across relevant views.

  -----------------------------------------------------------------------
  Filter                              Purpose
  ----------------------------------- -----------------------------------
  Date range                          Analyze feedback within a selected
                                      period

  Branch                              View one or multiple branches

  Region                              Compare regional performance

  Service channel                     Compare digital, physical, and
                                      other channels

  Insurance product                   Identify product-specific
                                      experience differences

  Satisfaction rating                 Isolate positive, neutral, or
                                      negative responses

  NPS classification                  View promoters, passives, and
                                      detractors

  Improvement factor                  Investigate specific customer
                                      concerns

  Feedback status                     View open, in-progress, resolved,
                                      and closed cases where applicable
  -----------------------------------------------------------------------

Predefined date ranges should include:

-   Today
-   Last 7 days
-   Last 30 days
-   Current month
-   Previous month
-   Current quarter
-   Previous quarter
-   Year to date
-   Custom date range

Filters must update relevant KPI cards, charts, tables, and drill-down
records consistently.

------------------------------------------------------------------------

## 8. Feedback Review and Case Management

The system should allow the company to act on feedback without making
the customer complete a longer survey.

### 8.1 Case creation

A feedback case may be created when:

-   A customer submits a low satisfaction rating.
-   A customer selects a serious improvement factor.
-   A customer submits a concerning comment.
-   An authorized administrator manually creates a case.

Case creation conditions must be configurable.

Suggested default rules:

-   CSAT of 1 or 2 out of 5: flag for review.
-   NPS of 0--6: classify as a detractor for analysis; do not
    automatically treat every detractor as a formal complaint.
-   Serious issue category: flag according to company policy.
-   A customer follow-up request, if added as a future optional
    interaction: create or flag a follow-up case.

### 8.2 Case fields

Each case should contain:

-   Case ID.
-   Feedback response ID.
-   Customer reference, where authorized.
-   Branch.
-   Service channel.
-   Insurance product.
-   Issue category.
-   Priority.
-   Case description.
-   Assigned department.
-   Assigned officer.
-   Date created.
-   Target resolution date.
-   Date resolved.
-   Resolution notes.
-   Escalation history.
-   Corrective action.
-   Customer follow-up outcome, where applicable.

### 8.3 Case statuses

Support:

-   New
-   Assigned
-   In Progress
-   Resolved
-   Closed

Escalation should be represented through an escalation flag or separate
escalation status/history.

### 8.4 Case management actions

Authorized administrators must be able to:

-   Review flagged feedback.
-   Create a case.
-   Assign a case to an officer or department.
-   Change priority.
-   Add internal notes.
-   Record investigation activities.
-   Escalate a case.
-   Record corrective action.
-   Mark a case resolved.
-   Close a case.
-   Review the case activity history.

### 8.5 Resolution metrics

The administrative dashboard should display:

-   Number of open cases.
-   Number of overdue cases.
-   Number of resolved cases.
-   Average resolution time.
-   Median resolution time.
-   Resolution rate.
-   Escalation rate.
-   Cases by department.
-   Cases by branch.
-   Cases by issue category.
-   Repeat complaints.
-   Percentage resolved within the defined SLA.

------------------------------------------------------------------------

## 9. User Roles and Access Control

Implement role-based access control (RBAC).

  -----------------------------------------------------------------------
  Role                                Permissions
  ----------------------------------- -----------------------------------
  Executive Administrator             Organization-wide analytics, all
                                      branches, comparisons, reports,
                                      feedback cases, and approved
                                      configuration

  Branch Manager                      Analytics and feedback records for
                                      assigned branch only

  Customer Experience Administrator   Authorized organization-wide
                                      feedback review, issue
                                      classification, follow-up
                                      management, and reporting

  Feedback Resolution Officer         Assigned feedback cases and
                                      authorized customer details needed
                                      for resolution

  System Administrator                User management, branch
                                      configuration, survey
                                      configuration, system settings, and
                                      technical administration

  Read-only Auditor                   Authorized read-only access to
                                      reports, feedback records, and
                                      audit logs
  -----------------------------------------------------------------------

### 9.1 Executive administrator permissions

An executive administrator must be able to:

1.  View company-wide feedback metrics.
2.  View all branch performance metrics.
3.  Select a branch and drill down into its analytics.
4.  Compare multiple branches.
5.  Compare branch performance with company-wide benchmarks.
6.  Filter by date, channel, product, region, and improvement factor.
7.  Export authorized reports.
8.  View feedback requiring management attention.
9.  Monitor corrective actions and case resolution.
10. Configure organization-wide satisfaction targets where authorized.

### 9.2 Branch manager permissions

A branch manager must:

-   View feedback and analytics for assigned branches only.
-   View branch performance against approved company benchmarks.
-   Review authorized feedback records associated with their branch.
-   View and manage cases assigned to their branch, according to
    permissions.

A branch manager must not:

-   Access another branch's identifiable customer feedback.
-   Modify submitted customer ratings.
-   Silently change branch attribution.
-   Access organization-wide identifiable feedback unless explicitly
    authorized.

### 9.3 Backend enforcement

All access restrictions must be enforced server-side and, where
supported, at the database level. Hiding interface elements is not
sufficient security.

------------------------------------------------------------------------

## 10. Non-Functional Requirements

  -----------------------------------------------------------------------
  Category                            Requirement
  ----------------------------------- -----------------------------------
  Security                            Administrative pages require
                                      authentication

  Access control                      Enforce role-based permissions on
                                      the backend

  Data protection                     Encrypt data in transit and at rest

  Privacy                             Collect only information necessary
                                      for feedback and authorized
                                      follow-up

  Performance                         Dashboard summaries should load
                                      within three seconds under normal
                                      operating conditions

  Scalability                         Support increasing response volumes
                                      and additional branches

  Availability                        Provide reliable access during and
                                      outside business hours

  Auditability                        Log important administrative
                                      actions and case activities

  Responsiveness                      Support mobile, tablet, and desktop
                                      interfaces

  Accessibility                       Provide readable labels, accessible
                                      contrast, and keyboard navigation

  Data integrity                      Protect submitted feedback from
                                      silent modification or deletion

  Reporting                           Support authorized CSV and Excel
                                      exports

  Localization                        Support configurable language and
                                      date formats

  Maintainability                     Allow authorized configuration of
                                      branches, products, channels,
                                      survey questions, and targets
  -----------------------------------------------------------------------

### 10.1 Privacy requirements

-   Display a concise privacy notice explaining why feedback is
    collected.
-   Explain how feedback and customer information may be used.
-   Obtain appropriate authorization or consent for follow-up where
    required.
-   Establish data retention and deletion policies.
-   Restrict personally identifiable information to authorized roles.
-   Avoid collecting policy numbers, national identification numbers, or
    other sensitive details unless necessary.
-   Where feasible, allow feedback to be analysed without exposing
    customer identity.
-   Separate customer identity data from analytical feedback data where
    practical.
-   Ensure exports respect the user's permissions and data-minimization
    requirements.

### 10.2 Analytical integrity

-   Distinguish zero responses from missing data.
-   Use valid responses as the denominator for satisfaction
    calculations.
-   Display response counts alongside percentages and averages.
-   Mark branches with insufficient response volumes.
-   Apply consistent date ranges when comparing branches.
-   Do not treat failed invitation deliveries as dissatisfied customers.
-   Do not compare branch rankings without indicating response volume.
-   Use configurable minimum response thresholds for rankings.
-   Preserve historical survey versions and their original response
    scales.

A configurable initial threshold, such as 30 responses, may be
considered for branch rankings. It should not prevent authorized
executives from viewing underlying data with an appropriate low-sample
warning.

------------------------------------------------------------------------

## 11. Metrics and Calculation Definitions

### 11.1 Customer Satisfaction Score (CSAT)

CSAT is the percentage of valid respondents selecting 4 or 5 on the
five-point satisfaction scale.

CSAT (%) = (Number of ratings 4 or 5 / Number of valid CSAT responses) ×
100

### 11.2 Average CSAT

Average CSAT = Sum of valid CSAT ratings / Number of valid CSAT
responses

Display as a score out of 5.

### 11.3 Customer Effort Score (CES)

Average CES = Sum of valid ease ratings / Number of valid CES responses

Display as a score out of 5. Higher scores indicate an easier customer
experience.

### 11.4 Net Promoter Score (NPS)

Classify responses as:

-   Detractors: 0--6.
-   Passives: 7--8.
-   Promoters: 9--10.

NPS = Percentage of Promoters − Percentage of Detractors

Display as a score from −100 to +100.

### 11.5 Negative feedback rate

Negative feedback rate (%) = (Number of valid CSAT responses rated 1 or
2 / Number of valid CSAT responses) × 100

### 11.6 Feedback response rate

Feedback response rate (%) = (Number of submitted feedback responses /
Number of delivered invitations) × 100

The dashboard must clearly state the denominator used. If delivery
confirmation is unavailable for a particular delivery channel, the
system must not incorrectly label sent invitations as delivered.

### 11.7 Completion time

Completion duration = Survey submission timestamp − Survey start
timestamp

The system should record the duration and use it to assess the
one-minute requirement. The measurement should begin when the survey
becomes interactive, not while the page is still loading.

------------------------------------------------------------------------

## 12. Completion-Time and Usability Acceptance Criteria

The one-minute requirement must be validated through usability testing
with representative customers.

Target criteria:

-   At least 90% of usability-test participants should complete the
    survey within 60 seconds.
-   Median completion time should be 40 seconds or less.
-   No mandatory free-text input.
-   No registration or login.
-   The standard survey should not exceed five main pages.
-   Single-choice rating pages must advance immediately after selection.
-   Back navigation must preserve all previously entered responses.
-   The survey must work on common mobile devices.
-   The interface must remain usable on slower network connections.
-   Customers must receive clear confirmation after successful
    submission.

Record the following usability events:

-   Survey opened timestamp.
-   Survey became interactive timestamp.
-   Survey submitted timestamp.
-   Completion duration.
-   Number of pages displayed.
-   Number of questions answered.
-   Page at which the survey was abandoned.
-   Whether the customer navigated backwards.
-   Whether the customer changed a previous answer.

Do not use survey completion duration alone as proof of usability.
Conduct actual customer testing and review abandonment patterns.

------------------------------------------------------------------------

## 13. Alerts, Targets, and Reporting

### 13.1 Configurable targets

Authorized executives should be able to configure targets for:

-   Overall CSAT.
-   Branch CSAT.
-   NPS.
-   CES.
-   Feedback response rate.
-   Negative feedback rate.
-   Case resolution time.
-   SLA compliance.

Targets may vary by branch, service channel, or insurance product where
justified.

### 13.2 Automated alerts

Support configurable alerts for:

-   Sudden declines in branch CSAT.
-   High volumes of negative feedback.
-   Increases in unresolved cases.
-   Repeated improvement factors within a branch.
-   Cases approaching or exceeding SLA deadlines.
-   Branches falling below configured satisfaction targets.
-   Significant increases in reported technical issues.

Alerts should be configurable by role, department, severity, and
notification channel.

### 13.3 Scheduled reports

Support:

-   Daily operational feedback summaries.
-   Weekly branch performance reports.
-   Monthly executive customer-experience reports.
-   Quarterly customer-experience trend reports.

Reports should include the reporting period, response volume, key
metrics, branch comparisons, significant improvement factors, and
relevant case-resolution information.

### 13.4 Export requirements

Authorized users should be able to export:

-   Organization-wide feedback summaries.
-   Branch performance reports.
-   Service-channel comparisons.
-   Insurance-product comparisons.
-   Customer satisfaction trends.
-   Feedback case reports.
-   Improvement-factor reports.

Exports must respect role permissions and minimize customer-identifying
information.

------------------------------------------------------------------------

## 14. Configuration and Administration

The system must provide authorized administrators with configuration
capabilities.

### 14.1 Branch management

-   Add branches.
-   Edit branch details.
-   Deactivate closed branches.
-   Assign branch managers.
-   Associate branches with regions.
-   Maintain stable branch identifiers.
-   Preserve historical branch attribution in submitted feedback.

### 14.2 Product management

-   Add and edit insurance product categories.
-   Activate and deactivate products.
-   Control which products appear in the survey.
-   Preserve historical product references.

### 14.3 Channel management

-   Configure service-channel options.
-   Activate or deactivate channels.
-   Configure whether a channel requires branch selection.
-   Preserve historical channel values.

### 14.4 Survey configuration

-   Configure question wording and answer options.
-   Configure which questions are mandatory.
-   Configure conditional display rules.
-   Configure survey versions.
-   Preserve the exact survey version associated with each submitted
    response.
-   Avoid changing historical responses when a question or scale is
    updated.

### 14.5 Audit logs

Record important administrative activities, including:

-   User creation and permission changes.
-   Branch and product configuration changes.
-   Survey configuration changes.
-   Feedback case assignment and status changes.
-   Case escalation and resolution.
-   Report exports where appropriate.
-   Changes to targets and alert rules.

------------------------------------------------------------------------

## 15. Suggested Data Model

The system should use a relational data model that supports survey
collection, branch reporting, analytics, and future integrations.

### 15.1 Core entities

  -----------------------------------------------------------------------
  Entity                              Purpose
  ----------------------------------- -----------------------------------
  Branch                              Stores branch name, code, region,
                                      and active status

  Region                              Stores organizational regions

  Customer                            Stores a customer reference and
                                      permitted identity information

  Transaction                         Stores transaction reference and
                                      relevant transaction dates, where
                                      available

  Feedback Invitation                 Stores secure token, delivery
                                      status, expiry, and invitation
                                      metadata

  Feedback Response                   Stores submitted customer ratings
                                      and comments

  Service Channel                     Stores controlled channel
                                      categories

  Insurance Product                   Stores controlled insurance product
                                      categories

  Improvement Factor                  Stores structured diagnostic
                                      categories

  Survey Version                      Stores question and scale versions

  Feedback Case                       Stores cases created from feedback

  Case Activity                       Stores case notes, assignment
                                      history, and status changes

  User                                Stores administrative users and
                                      role assignments

  Role / Permission                   Defines administrative access

  Audit Log                           Records important system and
                                      administrative actions

  Dashboard Target                    Stores configured performance
                                      targets

  Alert Rule                          Stores configurable notification
                                      conditions
  -----------------------------------------------------------------------

### 15.2 Feedback response fields

At minimum, the feedback response record should contain:

-   ID.
-   Invitation ID.
-   Survey version ID.
-   Service channel ID or controlled value.
-   Issuing branch ID, nullable where not applicable.
-   Insurance product ID.
-   CSAT score.
-   CES score.
-   NPS score.
-   Improvement factor ID, nullable.
-   Other improvement clarification, nullable.
-   Additional comment, nullable.
-   Survey start time.
-   Survey submission time.
-   Completion duration.
-   Created timestamp.

### 15.3 Data-model considerations

-   Branch, product, channel, and improvement-factor options must not be
    hardcoded into application logic.
-   Use stable identifiers for controlled values.
-   Allow issuing branch to be null where genuinely not applicable.
-   Do not use a null branch to represent multiple different situations
    without a separate reason or applicability field.
-   Preserve the customer's original selected values for auditability.
-   Maintain historical survey versions.
-   Separate invitation, response, and case records.
-   Ensure one valid response per invitation.

------------------------------------------------------------------------

## 16. Future Integrations and Enhancements

The first release should not depend on integrations that are not
currently available. However, the architecture should support future
API-based integrations with:

  -----------------------------------------------------------------------
  Existing system                     Potential information
  ----------------------------------- -----------------------------------
  Policy administration system        Policy and transaction references,
                                      product and completion data

  CRM                                 Customer reference and permitted
                                      relationship history

  Branch operations system            Branch information and actual
                                      service waiting times

  Mobile application                  Digital channel events and
                                      application errors

  Call centre system                  Call waiting time, duration, and
                                      interaction history

  Complaint management system         Existing complaints and resolution
                                      status

  Notification platform               Invitation delivery and failure
                                      status
  -----------------------------------------------------------------------

The system should clearly distinguish customer-reported information from
information obtained from operational systems.

For example, actual queue waiting time from a branch system must not be
presented as though the customer supplied it.

### Future enhancements

-   AI-assisted comment classification.
-   Sentiment analysis.
-   Emerging issue detection.
-   Automated executive summaries.
-   Customer experience trend analysis.
-   Advanced branch benchmarking.
-   Analysis of relationships between operational performance and
    customer satisfaction.
-   Optional post-resolution customer satisfaction survey.
-   Additional follow-up request workflow.

These enhancements must not increase the length of the initial customer
survey.

------------------------------------------------------------------------

## 17. Functional Requirements and Acceptance Criteria

  -----------------------------------------------------------------------
  ID                      Requirement             Acceptance criteria
  ----------------------- ----------------------- -----------------------
  FR-01                   Feedback invitation     An eligible completed
                          generation              transaction can
                                                  generate a unique
                                                  invitation

  FR-02                   Multi-page survey       The customer sees the
                                                  defined five-page
                                                  survey structure

  FR-03                   Transaction             Channel, issuing branch
                          identification          where applicable, and
                                                  insurance product are
                                                  collected on Page 1

  FR-04                   Conditional branch      Branch selection
                          selection               appears according to
                                                  configured channel
                                                  rules

  FR-05                   Automatic navigation    Selecting a rating on
                                                  Pages 2--4 immediately
                                                  advances to the next
                                                  page

  FR-06                   Back navigation         Customer can return to
                                                  previous pages

  FR-07                   Response persistence    Previous answers remain
                                                  intact when navigating
                                                  backwards and forwards

  FR-08                   CSAT collection         A valid score from 1 to
                                                  5 is collected

  FR-09                   CES collection          A valid score from 1 to
                                                  5 is collected

  FR-10                   NPS collection          A valid score from 0 to
                                                  10 is collected

  FR-11                   Optional diagnostic     Customer can select an
                          feedback                improvement factor and
                                                  optionally comment

  FR-12                   Progress indicator      Customer can identify
                                                  current and remaining
                                                  steps

  FR-13                   Completion tracking     System records start,
                                                  interactive,
                                                  submission, and
                                                  completion-duration
                                                  data

  FR-14                   Duplicate prevention    An invitation cannot
                                                  generate multiple valid
                                                  submissions

  FR-15                   Executive dashboard     Executive administrator
                                                  can view
                                                  organization-wide
                                                  metrics

  FR-16                   Branch analytics        Executive can select a
                                                  branch and view its
                                                  metrics

  FR-17                   Branch comparison       Executive can compare
                                                  branches for the same
                                                  reporting period

  FR-18                   Channel analytics       Dashboard supports
                                                  service-channel
                                                  comparisons

  FR-19                   Product analytics       Dashboard supports
                                                  insurance-product
                                                  comparisons

  FR-20                   Dashboard filtering     Metrics can be filtered
                                                  by date, branch,
                                                  channel, product, and
                                                  improvement factor

  FR-21                   Case creation           Authorized rules can
                                                  flag feedback or create
                                                  cases

  FR-22                   Case assignment         Authorized users can
                                                  assign cases to
                                                  officers or departments

  FR-23                   Case resolution         Cases can be tracked
                                                  through resolution and
                                                  closure

  FR-24                   Role-based access       Users can only access
                                                  information permitted
                                                  by their roles

  FR-25                   Report export           Authorized users can
                                                  export reports

  FR-26                   Survey configuration    Authorized
                                                  administrators can
                                                  configure questions and
                                                  options

  FR-27                   Survey versioning       Historical responses
                                                  retain their original
                                                  survey version

  FR-28                   Audit logging           Important
                                                  administrative and case
                                                  activities are recorded

  FR-29                   Automated alerts        Configured thresholds
                                                  can trigger
                                                  notifications

  FR-30                   Data protection         Customer and feedback
                                                  information are
                                                  protected from
                                                  unauthorized access
  -----------------------------------------------------------------------

### 17.1 Example acceptance test: Branch analytics

**Given** an executive administrator is logged into the system,

**When** the administrator selects a particular branch and reporting
period,

**Then** the system must:

1.  Display feedback associated with that branch for the selected
    period.
2.  Recalculate CSAT, NPS, CES, response volume, and other relevant
    metrics.
3.  Compare the branch against company-wide benchmarks for the same
    period.
4.  Update charts, tables, and improvement-factor breakdowns.
5.  Allow authorized drill-down into feedback records.
6.  Preserve selected filters when navigating between relevant dashboard
    views.

### 17.2 Example acceptance test: Survey navigation

**Given** a customer has opened a valid feedback invitation,

**When** the customer completes Page 1 and selects a rating on Page 2,

**Then** the system must:

1.  Save the selected rating to the current survey session.
2.  Immediately navigate to Page 3.
3.  Display the correct progress state.
4.  Allow the customer to navigate backwards.
5.  Restore the previous rating without requiring the customer to select
    it again.
6.  Allow the customer to change the rating and continue without
    creating a duplicate response.

------------------------------------------------------------------------

## 18. Recommended Implementation Phases

### Phase 1 --- Core Feedback System (MVP)

Build the minimum system required to collect and analyse customer
feedback.

-   Customer feedback form.
-   Secure feedback links.
-   Five-page guided survey.
-   Transaction channel, issuing branch, and product selection.
-   Conditional branch field.
-   Automatic navigation for rating questions.
-   Back navigation and response persistence.
-   CSAT, CES, and NPS collection.
-   Optional improvement factor and comment.
-   Survey completion-time tracking.
-   Executive dashboard.
-   Branch-specific dashboard.
-   Branch comparison.
-   Channel and product analytics.
-   Date and category filters.
-   Basic user roles.
-   CSV / Excel export.
-   Basic audit logging.

### Phase 2 --- Operational Management

-   Feedback case management.
-   Case assignment and escalation.
-   SLA tracking.
-   Follow-up notifications.
-   Complaint-resolution metrics.
-   Automated satisfaction alerts.
-   Branch manager dashboard.
-   Scheduled reports.
-   Expanded audit and activity history.

### Phase 3 --- Advanced Analytics

-   AI-assisted comment classification.
-   Sentiment analysis.
-   Emerging issue detection.
-   Automated executive summaries.
-   Advanced branch benchmarking.
-   Correlation between operational metrics and customer satisfaction.
-   Integration with CRM, policy administration, mobile application,
    branch operations, and complaint management systems.

------------------------------------------------------------------------

## 19. Final Product Structure

### Customer-facing application

1.  Transaction Information
2.  Overall Satisfaction
3.  Ease of Service
4.  Recommendation Likelihood
5.  Additional Feedback and Submission

### Administrative application

1.  Executive Dashboard
2.  Branch Performance
3.  Service Channel Analytics
4.  Insurance Product Analytics
5.  Customer Feedback Records
6.  Feedback Cases
7.  Reports and Exports
8.  User and Role Management
9.  Branch and Product Configuration
10. Survey Configuration
11. Targets and Alerts
12. Audit Logs

Navigation must be permission-aware. Branch managers should only see
authorized branch information, while executive administrators should
have organization-wide analytics access.

------------------------------------------------------------------------

## 20. Final Product Principles

The implementation must preserve the following principles:

1.  **Keep customer effort low.** The standard survey must be designed
    for completion in 60 seconds or less.
2.  **Collect essential context.** Service channel, issuing branch where
    applicable, and insurance product must be collected because the
    company does not already know these details.
3.  **Group related information.** Keep all three
    transaction-identification questions on Page 1.
4.  **Make rating questions effortless.** Selecting an answer on Pages
    2--4 should immediately advance the survey.
5.  **Preserve navigation freedom.** Customers must be able to go
    backwards and correct answers without losing their progress.
6.  **Use structured data.** Core analytical dimensions must use
    controlled values rather than depending on free-text comments.
7.  **Keep optional feedback optional.** Customers must be able to
    submit without writing comments.
8.  **Make analytics comprehensive.** The dashboard should provide
    organization-wide, branch-specific, service-channel, and
    product-specific insights.
9.  **Turn feedback into action.** Flagging, assigning, investigating,
    and resolving feedback should be handled through the administrative
    portal.
10. **Protect customer information.** Apply appropriate access control,
    privacy safeguards, data retention, and auditability.
11. **Measure the one-minute objective.** Track actual completion times
    and validate the experience with representative customers.
12. **Build for extension.** Keep the system modular so that operational
    integrations and advanced analytics can be added without lengthening
    the initial survey.

**The intended outcome is a lightweight customer feedback experience
supported by a comprehensive management intelligence platform. Customers
should spend less than a minute sharing their experience, while the
company gains the information needed to understand and improve service
delivery across its branches, channels, and insurance products.**
