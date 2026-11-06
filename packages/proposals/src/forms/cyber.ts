// CYBER LIABILITY PROPOSAL FORM
// Source: PROPOSAL FORMS/ACCIDENTS/Cyber Crime Proposal form (1).pdf (and the .docx it was printed from)
// The PDF is used for layout and numbering (sections A–I); the .docx has the same text in text boxes.
// The PDF misprints E.6 as "." and splits some questions across text boxes; numbering is restored.
// Sections C, D and H say "to be completed only if …"; a gate question is asked for each so the
// wizard can skip them (the paper leaves that to the proposer). The paper has no period of
// insurance or signatory name block beyond "Signed / Title / Organisation / Date"; a period is
// added in the last step and printed with the declaration.
import { businessIdentitySection } from '../kyc';
import { CURRENCIES } from '../options';
import type { Condition, Field, FormDefinition, YesNoField } from '../schema';

const yes = (field: string) => ({ field, equals: 'yes' }) as const;
const no = (field: string) => ({ field, equals: 'no' }) as const;

/** A required Yes/No question as printed ("…… Yes No"). */
const yn = (
  id: string,
  number: string | undefined,
  label: string,
  extra: Partial<Omit<YesNoField, 'id' | 'type'>> = {},
): YesNoField => ({ id, type: 'yesno', ...(number ? { number } : {}), label, required: true, ...extra });

/** A free-text answer box printed under a question. */
const text = (
  id: string,
  number: string | undefined,
  label: string,
  showIf?: Condition,
  required = true,
): Field => ({
  id,
  type: 'textarea',
  ...(number ? { number } : {}),
  label,
  required,
  ...(showIf ? { showIf } : {}),
  maxLength: 1000,
});

const YES_NO_NA = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'na', label: 'N/A' },
] as const;

const DATA_CATEGORIES = [
  { value: 'basic_personal', label: 'Basic personal information' },
  { value: 'sensitive_personal', label: 'Sensitive personal information' },
  { value: 'payment_card', label: 'Payment card information' },
  { value: 'financial_account', label: 'Financial account information' },
  { value: 'health', label: 'Health related information' },
  { value: 'employee_personal', label: 'Employee personal information' },
  { value: 'third_party_corporate', label: '3rd party corporate information' },
] as const;

const compliance = (id: string, label: string): Field[] => [
  {
    id,
    type: 'radio',
    label,
    docLabel: `${label} – Compliant?`,
    options: YES_NO_NA,
    required: true,
    width: 'half',
    row: id,
  },
  {
    id: `${id}_details`,
    type: 'text',
    label: 'Details',
    docLabel: 'If ‘No’, please provide details',
    required: true,
    showIf: no(id),
    width: 'half',
    row: id,
    maxLength: 300,
  },
];

const incidents: readonly [string, string][] = [
  [
    'incident_disclosure',
    'The unauthorised disclosure or transmission of any confidential information for which you are responsible',
  ],
  [
    'incident_intrusion',
    'Any intrusion of, unauthorised access to, or unauthorised use of your computer system',
  ],
  [
    'incident_employee_error',
    'Any accidental, negligent or unintentional act or failure to act by an employee or an employee of any third party service provider whilst operating, maintaining or upgrading your computer system',
  ],
  ['incident_suspension', 'The suspension or degradation of your computer system'],
  [
    'incident_data_loss',
    'Your inability to access data due to such data being deleted, damaged, corrupted, altered or lost',
  ],
  ['incident_extortion', 'Receipt of an extortion demand or security threat'],
  ['incident_claim', 'Receipt of a claim in respect of any of the above'],
  [
    'incident_regulator',
    'Any formal or official action, investigation, inquiry or audit by a regulator arising out of your use, control, collection, storing, processing or suspected misuse of personal information',
  ],
];

const revenueStreams: readonly [string, string, string][] = [
  ['a', 'revenue_online', 'Online sales'],
  ['b', 'revenue_offline', 'Offline sales'],
  ['c', 'revenue_brokerage', 'Brokerage / commission'],
  ['d', 'revenue_usage_fees', 'Unit / usage fees'],
  ['e', 'revenue_subscription', 'Contract / subscription / licensing fees'],
  ['f', 'revenue_professional', 'Professional / service fees'],
  ['g', 'revenue_lending', 'Lending / renting / leasing'],
  ['h', 'revenue_investment', 'Investment income'],
  ['i', 'revenue_donations', 'Donations'],
  ['j', 'revenue_grants', 'Grants'],
  ['k', 'revenue_other', 'Other (please advise)'],
];

const NI = yes('wants_network_interruption');
const OUTSOURCES = yes('outsources_it');
const CARDS = yes('accepts_cards');

export const cyber: FormDefinition = {
  id: 'cyber',
  version: 1,
  title: 'CYBER LIABILITY PROPOSAL FORM',
  subtitle: 'Cyber Liability: Proposal Form',
  source: 'ACCIDENTS/Cyber Crime Proposal form (1).pdf',
  steps: [
    {
      id: 'organisation',
      title: 'Organisation',
      description: 'The organisation to be insured. We fill in what we already know.',
      sections: [
        {
          id: 'general',
          number: 'A',
          title: 'General information',
          fields: [
            {
              id: 'company_name',
              type: 'text',
              number: '1',
              label: 'Name of organisation',
              required: true,
              prefill: 'companyName',
              saveToProfile: 'companyName',
              role: 'insuredName',
              maxLength: 160,
            },
            // added for online sale
            {
              id: 'registration_no',
              type: 'text',
              label: 'Company registration number',
              help: 'From the Office of the Registrar of Companies (ORC) certificate.',
              required: true,
              prefill: 'companyRegNo',
              saveToProfile: 'companyRegNo',
              width: 'half',
              row: 'reg',
              maxLength: 30,
            },
            // added for online sale
            {
              id: 'tin',
              type: 'text',
              label: 'Taxpayer identification number (TIN)',
              format: 'tin',
              required: true,
              prefill: 'tin',
              saveToProfile: 'tin',
              width: 'half',
              row: 'reg',
            },
            // added for online sale
            {
              id: 'contact_person',
              type: 'text',
              label: 'Contact person',
              help: 'Who we should speak to about this proposal, ideally your IT or security lead.',
              required: true,
              maxLength: 120,
            },
            // added for online sale
            {
              id: 'phone',
              type: 'phone',
              label: 'Telephone number',
              required: true,
              prefill: 'phone',
              width: 'half',
              row: 'contact',
            },
            // added for online sale
            {
              id: 'email',
              type: 'email',
              label: 'Email address',
              help: 'We send your policy documents and receipts here.',
              required: true,
              prefill: 'email',
              saveToProfile: 'email',
              width: 'half',
              row: 'contact',
            },
            {
              id: 'principal_address',
              type: 'textarea',
              number: '2',
              label: 'Principal address',
              docLabel: 'Principle address',
              required: true,
              role: 'riskAddress',
              prefill: 'postalAddress',
              maxLength: 200,
            },
            {
              id: 'date_established',
              type: 'date',
              number: '3',
              label: 'Date of establishment',
              required: true,
              maxDays: 0,
              width: 'half',
            },
            yn(
              'mergers_past_5_years',
              '4',
              'Have any mergers or acquisitions taken place in the last 5 years?',
              {
                details: {
                  when: 'yes',
                  label:
                    'Details, including how processes, policies and procedures have been integrated with the main group',
                  docLabel:
                    'If ‘Yes’, please provide details, including how processes, policies and procedures have been integrated with the main group',
                },
              },
            ),
            yn('mergers_planned', '5', 'Are there planned mergers or acquisitions for the next 12 months?'),
            yn('joint_ventures', '6', 'Are you involved in any joint ventures?', {
              details: {
                when: 'yes',
                label:
                  'Details, including how processes, policies and procedures have been integrated with the main group',
                docLabel:
                  'If ‘Yes’, please provide details including how processes, policies and procedures have been integrated with the main group',
              },
            }),
            text('business_overview', '7', 'Please provide an overview of your business activities'),
            {
              id: 'employee_count',
              type: 'number',
              number: '8',
              label: 'Please state the number of employees',
              min: 1,
              required: true,
              width: 'half',
            },
          ],
        },
        {
          id: 'revenue',
          number: '9',
          title: 'Please complete the following revenue table',
          fields: [
            {
              id: 'revenue_currency',
              type: 'select',
              label: 'Currency',
              options: CURRENCIES,
              required: true,
              width: 'half',
            },
            // Paper: fixed rows UK/Europe, USA/Canada, Rest of World (Ghana falls under Rest of World).
            {
              id: 'revenue_table',
              type: 'table',
              label: 'Revenue amount',
              help: 'Amounts in the currency chosen above. Ghana and the rest of Africa go under “Rest of world”.',
              required: true,
              minRows: 1,
              maxRows: 3,
              printRows: 3,
              addLabel: 'Add another region',
              columns: [
                {
                  id: 'geography',
                  label: 'Geography',
                  type: 'select',
                  required: true,
                  options: [
                    { value: 'uk_europe', label: 'UK / Europe' },
                    { value: 'usa_canada', label: 'USA / Canada' },
                    { value: 'rest_of_world', label: 'Rest of world' },
                  ],
                },
                {
                  id: 'last_year_actual',
                  label: 'Last complete year (actual)',
                  type: 'number',
                  required: true,
                  weight: 1.2,
                },
                {
                  id: 'current_year_estimate',
                  label: 'Current year (estimate)',
                  type: 'number',
                  weight: 1.2,
                },
                { id: 'next_year_estimate', label: 'Next year (estimate)', type: 'number', weight: 1.2 },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'data',
      title: 'Data',
      sections: [
        {
          id: 'data_exposure',
          number: 'B',
          title: 'Data exposure',
          fields: [
            {
              id: 'data_records',
              type: 'table',
              number: '1',
              label:
                'Please state the number of data records currently processed/stored in the following categories',
              help: 'One line per category you hold. Approximate numbers are fine.',
              required: true,
              minRows: 1,
              maxRows: 7,
              printRows: 7,
              addLabel: 'Add another category',
              columns: [
                {
                  id: 'category',
                  label: 'Category',
                  type: 'select',
                  options: DATA_CATEGORIES,
                  required: true,
                  weight: 1.8,
                },
                { id: 'uk_processed', label: 'UK/Europe processed', type: 'number' },
                { id: 'uk_stored', label: 'UK/Europe stored', type: 'number' },
                { id: 'us_processed', label: 'US/Canada processed', type: 'number' },
                { id: 'us_stored', label: 'US/Canada stored', type: 'number' },
                { id: 'row_processed', label: 'Rest of world processed', type: 'number' },
                { id: 'row_stored', label: 'Rest of world stored', type: 'number' },
              ],
            },
            yn('data_shared', '2', 'Is customer/client information shared with 3rd parties?'),
            text(
              'data_shared_with',
              'a',
              'Who is data shared with and for what purpose?',
              yes('data_shared'),
            ),
            yn(
              'data_shared_indemnified',
              'b',
              'Are you indemnified for breaches of the data by such 3rd parties?',
              {
                showIf: yes('data_shared'),
              },
            ),
            yn('data_anonymised', 'c', 'Is data always anonymised/aggregated prior to release?', {
              showIf: yes('data_shared'),
            }),
            yn(
              'data_permission',
              'd',
              'Where data is not anonymised, do you always seek permission from the data subject prior to release?',
              { showIf: yes('data_shared') },
            ),
            yn(
              'data_transfer_protection',
              '3',
              'Do you ensure that data is not transferred to any territory unless such territory has an adequate level of protection for the rights and freedoms of the data subjects in relation to the processing of personal data?',
            ),
          ],
        },
      ],
    },
    {
      id: 'interruption',
      title: 'Network interruption',
      sections: [
        {
          id: 'interruption_gate',
          number: 'C',
          title: 'Network interruption exposure',
          fields: [
            {
              id: 'interruption_notice',
              type: 'read',
              label: 'Who completes this section',
              paragraphs: [
                'Section to be completed only if the proposer is looking to purchase Network Interruption cover.',
              ],
            },
            // Gate for the paper's "Section to be completed only if …".
            yn(
              'wants_network_interruption',
              undefined,
              'Are you looking to purchase Network Interruption cover?',
              {
                help: 'Cover for loss of income when your computer systems or network go down.',
              },
            ),
          ],
        },
        {
          id: 'revenue_split',
          number: '1',
          title: 'Please provide a split of your revenue / income streams',
          showIf: NI,
          fields: [
            ...revenueStreams.map(([n, id, label]): Field => ({
              id,
              type: 'percent',
              number: n,
              label,
              width: 'third',
            })),
            {
              id: 'revenue_other_details',
              type: 'text',
              label: 'Other income stream (please advise)',
              required: true,
              showIf: {
                all: [
                  { field: 'revenue_other', truthy: true },
                  { not: { field: 'revenue_other', equals: 0 } },
                ],
              },
              maxLength: 200,
            },
          ],
        },
        {
          id: 'interruption',
          showIf: NI,
          fields: [
            text(
              'interruption_impact',
              '2',
              'In what way would revenue/profit be impacted following a disruption to or failure of your computer system, network or applications (please include estimates of lost revenue, 3rd party liability and customer churn)?',
            ),
            text(
              'seasonal_peaks',
              '3',
              'Please outline any seasonal peaks in revenue, including the relevant percentage increase',
            ),
            {
              id: 'time_to_profit_loss',
              type: 'text',
              number: '4',
              label: 'Please state the time after which disruption would lead to a reduction in net profit',
              help: 'For example 4 hours, 1 day.',
              required: true,
              maxLength: 120,
            },
            text(
              'outage_prevention',
              '5',
              'Please describe actions taken to prevent outages from occurring, including usage of backup power systems, fault tolerant architecture, excess bandwidth for multiple providers, etc.',
            ),
            text(
              'outage_mitigation',
              '6',
              'Please describe the actions taken by you to mitigate or address the impact of such disruption if it were to occur, including details of any operational and system failover measures',
            ),
            text(
              'additional_costs',
              '7',
              'What additional costs would be incurred to minimise the impact of a disruption, or to continue ‘business as usual’?',
            ),
            yn('bcp_drp', '8', 'Do you have formal business continuity / disaster recovery plans?'),
            {
              id: 'recovery_time_objective',
              type: 'text',
              number: 'a',
              label: 'What are the recovery time objectives for system restoration?',
              required: true,
              showIf: yes('bcp_drp'),
              maxLength: 200,
            },
            {
              id: 'plan_testing_frequency',
              type: 'text',
              number: 'b',
              label: 'How often are such plans tested?',
              required: true,
              showIf: yes('bcp_drp'),
              maxLength: 200,
            },
            yn(
              'change_management',
              '9',
              'Do you have a formal change management control policy including risk assessment, testing, authorization, change control procedures and roll back procedures for major systems?',
            ),
            yn(
              'lifecycle_management',
              '10',
              'Do you have a lifecycle management process for assessing and replacing system/network equipment?',
            ),
          ],
        },
      ],
    },
    {
      id: 'outsourcing',
      title: 'Outsourcing',
      sections: [
        {
          id: 'outsourcing_gate',
          number: 'D',
          title: 'Outsourcing exposure',
          fields: [
            {
              id: 'outsourcing_notice',
              type: 'read',
              label: 'Who completes this section',
              paragraphs: [
                'Section to be completed only if the proposer outsources IT / Data services to third parties.',
              ],
            },
            // Gate for the paper's "Section to be completed only if …".
            yn(
              'outsources_it',
              undefined,
              'Do you outsource IT / data services to third parties (including cloud providers)?',
            ),
          ],
        },
        {
          id: 'outsourcing',
          showIf: OUTSOURCES,
          fields: [
            {
              id: 'outsourced_services',
              type: 'table',
              number: '1',
              label:
                'Please state all IT / Data services that are outsourced to third parties, including cloud providers (please use a separate sheet if required)',
              required: true,
              minRows: 1,
              printRows: 8,
              addLabel: 'Add another service',
              columns: [
                { id: 'service', label: 'Service', type: 'text', required: true, weight: 1.8 },
                { id: 'vendor', label: 'Vendor name', type: 'text', required: true, weight: 1.4 },
                {
                  id: 'on_demand',
                  label: 'On demand service (IaaS, PaaS or SaaS)',
                  type: 'select',
                  required: true,
                  options: [
                    { value: 'yes', label: 'Yes' },
                    { value: 'no', label: 'No' },
                  ],
                },
              ],
            },
            text(
              'osp_due_diligence',
              '2',
              'What due diligence is undertaken before engaging with a new outsourced service provider (OSP)?',
            ),
            yn('osp_audits', '3', 'Do you have a process for regular security audits on OSPs?'),
            text(
              'shared_infrastructure_risk',
              '4',
              'Where data is processed or stored by 3rd party providers, how do you assess and manage the risks posed by shared infrastructure such as clouds or shared servers?',
            ),
            yn('private_cloud', '5', 'For all on-demand services, is data stored in a private cloud?', {
              details: {
                when: 'no',
                label: 'To what extent are public clouds used and how is access to data controlled?',
                docLabel:
                  'If ‘No’, to what extent are public clouds used and how is access to data controlled?',
              },
            }),
            text(
              'breach_notification_costs',
              '6',
              'If a data breach occurs, which party incurs the costs of notification and what is the OSP’s obligation in this situation?',
            ),
            text(
              'osp_unavailable_impact',
              '7',
              'If an OSP system or cloud service is unavailable, what is the likely impact on you?',
            ),
            text(
              'osp_indemnities',
              '8',
              'What contractual indemnities are in place in the event of a data breach or network unavailability caused/suffered by the OSP or cloud provider?',
            ),
            text(
              'osp_bcp',
              '9',
              'How do your business continuity and/or disaster recovery plans address an OSP or cloud failure?',
            ),
          ],
        },
      ],
    },
    {
      id: 'security',
      title: 'Security',
      sections: [
        {
          id: 'data_security',
          number: 'E',
          title: 'Data security',
          fields: [
            yn('chief_privacy_officer', '1', 'Have you designated a Chief Privacy Officer?', {
              details: {
                when: 'no',
                label:
                  'How is this function monitored and controlled within your organisation, and who is responsible?',
                docLabel:
                  'If ‘No’, please explain how this function is monitored and controlled within your organisation and who is responsible',
              },
            }),
            yn('privacy_policy', '2', 'Do you have a group-wide privacy policy?'),
            yn('privacy_policy_compliance', undefined, 'Are you in compliance with it?', {
              docLabel: 'If ‘Yes’, are you in compliance with it?',
              showIf: yes('privacy_policy'),
            }),
            yn(
              'data_classification',
              '3',
              'Do you have a data classification policy with adequate levels of security in place for sensitive data?',
            ),
            yn(
              'access_restricted',
              '4',
              'Is your network configured to ensure that access to sensitive data is limited to properly authorised requests, with privileges reviewed regularly?',
            ),
            yn('access_monitored', '5', 'Do you monitor access to sensitive information on your network?'),
            yn(
              'encrypted_at_rest',
              '6',
              'Is all sensitive and confidential information stored on your databases/servers and data files encrypted?',
              {
                details: {
                  when: 'no',
                  label:
                    'Describe the security measures (i.e. access controls) in place to protect this information',
                  docLabel:
                    'If ‘No’, please describe the security measures (i.e. access controls) in place to protect this information',
                },
              },
            ),
            yn(
              'encrypted_in_transit',
              '7',
              'Is sensitive / confidential information encrypted in transmission?',
            ),
            yn('weekly_backup', '8', 'Is all critical data backed-up at least weekly?'),
            yn('own_backup_media', '9', 'Do you maintain your own back-up tapes/cassettes/disks etc.?'),
            yn('backup_secured', undefined, 'Are they stored in a physically secured location?', {
              docLabel: 'If ‘Yes’, are they stored in a physically secured location?',
              showIf: yes('own_backup_media'),
            }),
          ],
        },
        {
          id: 'compliance',
          number: '10',
          title: 'Please state your compliance with the following',
          fields: [
            ...compliance('pci_dss', 'Payment Card Industry Data Security Standards'),
            {
              id: 'pci_version',
              type: 'radio',
              label: 'Please select version',
              options: [
                { value: '2.0', label: '2.0' },
                { value: '3.0', label: '3.0' },
              ],
              showIf: yes('pci_dss'),
              width: 'half',
              row: 'pci_detail',
            },
            {
              id: 'pci_level',
              type: 'radio',
              label: 'Please select level',
              options: [
                { value: '1', label: '1' },
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '4', label: '4' },
              ],
              showIf: yes('pci_dss'),
              width: 'half',
              row: 'pci_detail',
            },
            ...compliance('facta', 'Fair and Accurate Credit Transactions Act (FACTA)'),
            ...compliance('hipaa', 'Health Information Portability and Accountability Act (HIPAA)'),
            ...compliance(
              'hitech',
              'Health Information Technology for Economic and Clinical Health Act (HITECH)',
            ),
            ...compliance('glba', 'Gramm-Leach Bliley Act (1999)'),
            {
              id: 'other_standard',
              type: 'text',
              label: 'Other (please specify)',
              help: 'For example the Data Protection Act, 2012 (Act 843) or Bank of Ghana Cyber and Information Security Directive.',
              width: 'half',
              maxLength: 120,
            },
            {
              id: 'other_standard_compliant',
              type: 'radio',
              label: 'Other – compliant?',
              options: YES_NO_NA,
              required: true,
              showIf: { field: 'other_standard', truthy: true },
              width: 'half',
            },
            {
              id: 'other_standard_details',
              type: 'text',
              label: 'Details',
              docLabel: 'If ‘No’, please provide details',
              required: true,
              showIf: no('other_standard_compliant'),
              maxLength: 300,
            },
          ],
        },
        {
          id: 'retention',
          fields: [
            text('retention_policy', '11', 'Please describe your data retention and destruction policy'),
            yn(
              'user_revocation',
              '12',
              'Do you have user revocation procedures on user accounts following employee termination?',
            ),
          ],
        },
        {
          id: 'network_security',
          number: 'F',
          title: 'Network security',
          fields: [
            {
              id: 'security_controls',
              type: 'checkboxes',
              number: '1',
              label: 'Do you utilise the following (please select all that apply)?',
              required: true,
              options: [
                { value: 'perimeter_firewall', label: 'Firewalls at the network perimeter' },
                {
                  value: 'internal_firewall',
                  label: 'Firewalls protecting sensitive resources kept inside the network',
                },
                { value: 'waf', label: 'Web application firewalls (WAF)' },
                {
                  value: 'antivirus',
                  label:
                    'Anti-virus or anti-malware software that is updated or patched in accordance to vendor recommendations',
                },
                { value: 'ids_ips', label: 'Intrusion detection or prevention systems' },
                { value: 'vulnerability_scanning', label: 'Proactive vulnerability scanning' },
                { value: 'physical_controls', label: 'Physical controls preventing access to the network' },
                {
                  value: 'remote_access_controls',
                  label: 'Network access controls for remote access (e.g. VPN with 2 factor authentication)',
                },
              ],
            },
            yn('scans_all_pages', undefined, 'Do your vulnerability scans include all web pages?', {
              docLabel: 'If selected, do your vulnerability scans include all web pages?',
              showIf: { field: 'security_controls', includes: 'vulnerability_scanning' },
            }),
            yn(
              'strong_passwords',
              '2',
              'Do you enforce a ‘strong password policy’ requiring passwords of adequate complexity and length, avoiding re-use for all accounts?',
              {
                details: {
                  when: 'no',
                  label: 'Describe the measures in place to manage password security',
                  docLabel: 'If ‘No’, please describe the measures in place to manage password security',
                },
              },
            ),
            yn('hardening', '3', 'Do you carry out server and application security configuration hardening?'),
            yn(
              'whitelist',
              '4',
              'Does the organisation maintain a whitelist to prevent malicious software and other unapproved programs from running?',
            ),
            yn(
              'least_privilege',
              undefined,
              'Do you apply the principle of least privilege to user rights?',
              {
                docLabel: 'If ‘No’, do you apply the principle of least privilege to user rights?',
                showIf: no('whitelist'),
              },
            ),
            text(
              'patch_management',
              '5',
              'Please describe your process for managing and installing patches on systems and applications (including any testing / due diligence phase prior to deployment)',
            ),
            yn('unsupported_software', '6', 'Are you using any unsupported operating systems or software?', {
              details: {
                when: 'yes',
                label: 'How do you plan to address this issue?',
                docLabel: 'If ‘Yes’, how do you plan to address this issue?',
              },
            }),
            yn(
              'change_control',
              '7',
              'Do you have a formal change control policy which includes risk assessment, testing, authorisation, change control procedures and roll back procedures for major systems?',
            ),
            yn(
              'critical_backup_frequency',
              '8',
              'Do you backup critical systems more often than non-critical systems?',
            ),
            yn('byod', '9', 'Do you allow BYOD (bring your own device)?', {
              docLabel: 'Do you allow BYOD?',
              details: {
                when: 'yes',
                label:
                  'How do you manage this risk? Include details of access control and remote device wiping',
                docLabel:
                  'If Yes, how do you manage this risk? Please also include details regarding access control and remote device wiping',
              },
            }),
            yn('usb_disabled', '10', 'Is write access to USB drives disabled for employees?'),
            text(
              'advanced_malware',
              '11',
              'Please describe how you monitor and actively block advanced malware (which cannot be detected by traditional anti-virus software)',
            ),
            yn('social_media', '12', 'Does your organisation have a social media presence?'),
            yn(
              'social_media_user_specific',
              undefined,
              'Are all accounts ‘user specific’ rather than general administration accounts?',
              {
                docLabel:
                  'If ‘Yes’, are all accounts ‘user specific’ rather than general administration accounts and how is social media activity monitored?',
                showIf: yes('social_media'),
                details: { when: 'yes', label: 'How is social media activity monitored?', required: false },
              },
            ),
          ],
        },
        {
          id: 'policies_testing',
          number: 'G',
          title: 'Security policies and testing procedures',
          fields: [
            yn('certified_standards', '1', 'Do you maintain any certified information security standards?', {
              details: {
                when: 'yes',
                label: 'Please state (e.g. ISO27001)',
                docLabel: 'If ‘Yes’, please state (e.g. ISO27001)',
              },
            }),
            yn(
              'security_policy',
              '2',
              'Do you have a group-wide security policy, which is communicated to all employees?',
            ),
            yn('threat_intelligence', '3', 'Do you have a cyber-threat intelligence gathering function?'),
            yn('pen_testing', '4', 'Is regular penetration testing carried out by a 3rd party?'),
            {
              id: 'pen_test_last',
              type: 'date',
              number: 'a',
              label: 'When was the last test performed?',
              required: true,
              maxDays: 0,
              showIf: yes('pen_testing'),
              width: 'half',
            },
            yn('pen_test_concerns', 'b', 'Were any serious concerns raised in any aspect of the network?', {
              showIf: yes('pen_testing'),
            }),
            text(
              'pen_test_remediated',
              'c',
              'Have concerns been addressed and successfully remediated?',
              yes('pen_test_concerns'),
            ),
            yn('security_assessments', '5', 'Are regular security assessments carried out by a 3rd party?'),
            {
              id: 'assessment_last',
              type: 'date',
              number: 'a',
              label: 'When was the last assessment undertaken?',
              required: true,
              maxDays: 0,
              showIf: yes('security_assessments'),
              width: 'half',
            },
            yn('assessment_concerns', 'b', 'Were any serious concerns raised in any aspect of the network?', {
              showIf: yes('security_assessments'),
            }),
            text(
              'assessment_remediated',
              'c',
              'Have concerns been addressed and successfully remediated?',
              yes('assessment_concerns'),
            ),
            yn(
              'awareness_training',
              '6',
              'Do you have a continuous awareness training programme for employees regarding data privacy/security, including legal liability and social engineering issues?',
            ),
            yn(
              'phishing_testing',
              undefined,
              'Does this include any active social engineering testing (e.g. phishing) on employees?',
              {
                docLabel:
                  'If ‘Yes’, does this include any active social engineering testing (e.g. phishing) on employees?',
                showIf: yes('awareness_training'),
              },
            ),
            yn(
              'background_checks',
              '7',
              'Do you perform background verification checks for all candidates of employment, contractors and 3rd party users?',
            ),
          ],
        },
      ],
    },
    {
      id: 'cards',
      title: 'Card payments',
      sections: [
        {
          id: 'cards_gate',
          number: 'H',
          title: 'Merchants, points of sale and PCI',
          fields: [
            {
              id: 'cards_notice',
              type: 'read',
              label: 'Who completes this section',
              paragraphs: ['Section to be completed only if the proposer accepts payment by card.'],
            },
            // Gate for the paper's "Section to be completed only if …".
            yn('accepts_cards', undefined, 'Do you accept payment by card?'),
          ],
        },
        {
          id: 'card_present',
          showIf: CARDS,
          fields: [
            yn('card_present', '1', 'Do you accept payment via Card-Present transactions?'),
            ...(
              [
                ['emv', 'a', 'Are you fully compliant with EMV card processing standards?'],
                ['pos_anti_tamper', 'b', 'Do your POS systems have anti-tampering features?'],
              ] as const
            ).map(([id, n, label]) => yn(id, n, label, { showIf: yes('card_present') })),
            text(
              'pos_encryption',
              'c',
              'Please describe the encryption and/or tokenisation process of data flowing through your POS network, please include whether point-to-point encryption is used',
              yes('card_present'),
            ),
            ...(
              [
                [
                  'pos_file_alerts',
                  'd',
                  'Do changes on individual files on the POS system create alerts in real-time?',
                ],
                [
                  'pos_change_approval',
                  'e',
                  'Do changes to the POS systems require formal approval prior to implementation?',
                ],
                [
                  'pos_scanned',
                  'f',
                  'Are your POS devices regularly scanned for malware or skimming devices?',
                ],
              ] as const
            ).map(([id, n, label]) => yn(id, n, label, { showIf: yes('card_present') })),
            {
              id: 'pos_assessment_frequency',
              type: 'text',
              number: 'g',
              label: 'How often is your POS network assessed by a 3rd party?',
              required: true,
              showIf: yes('card_present'),
              maxLength: 120,
            },
            yn(
              'pos_vulnerabilities',
              'h',
              'Did your last POS network assessment highlight any critical or high level vulnerabilities?',
              {
                showIf: yes('card_present'),
              },
            ),
            yn('pos_vulnerabilities_remediated', undefined, 'Have these been remediated?', {
              docLabel: 'If Yes, have these been remediated?',
              showIf: yes('pos_vulnerabilities'),
            }),
            yn(
              'pa_dss_vendor',
              'i',
              'Is your POS system developed and maintained by a PA-DSS compliant vendor?',
              {
                showIf: yes('card_present'),
              },
            ),
            yn('default_passwords_changed', 'j', 'Have all vendor-provided default passwords been changed?', {
              showIf: yes('card_present'),
            }),
            text(
              'pos_segregation',
              'k',
              'Please describe how you segregate your POS and corporate network',
              yes('card_present'),
            ),
            yn('user_activity_monitored', 'l', 'Is all user activity on the network monitored?', {
              showIf: yes('card_present'),
            }),
            yn(
              'transaction_logs_reviewed',
              'm',
              'Is payment transaction log data collected and reviewed on a regular basis?',
              {
                showIf: yes('card_present'),
              },
            ),
          ],
        },
        {
          id: 'card_not_present',
          showIf: CARDS,
          fields: [
            yn('card_not_present', '2', 'Do you accept payment via Card-not-Present transactions?'),
            yn('payment_gateway', 'a', 'Do you use 3rd party payment gateways to process payments?', {
              showIf: yes('card_not_present'),
            }),
            text(
              'card_data_flow',
              'b',
              'Please describe how payment card data is captured and transferred to the credit card processor, including the encryption and/or tokenisation process',
              yes('card_not_present'),
            ),
          ],
        },
      ],
    },
    {
      id: 'incidents',
      title: 'Incidents & cover',
      sections: [
        {
          id: 'incident_response',
          number: 'I',
          title: 'Incident response and claims history',
          fields: [
            yn(
              'incident_log',
              '1',
              'Do you keep an incident log of all system security breaches and network failures?',
              {
                details: {
                  when: 'yes',
                  label: 'Describe the escalation and review process for such incidents',
                  docLabel: 'If ‘Yes’, please describe the escalation and review process for such incidents',
                },
              },
            ),
            yn(
              'incident_response_plan',
              '2',
              'Do you have an incident response plan which includes a team with specified roles and responsibilities?',
            ),
            yn('incident_plan_tested', undefined, 'Has this been tested within the last 12 months?', {
              docLabel: 'If ‘Yes’, has this been tested within the last 12 months?',
              showIf: yes('incident_response_plan'),
            }),
          ],
        },
        {
          id: 'incident_history',
          number: '3',
          title: 'During the last 5 years, have you suffered from any of the following?',
          fields: [
            ...incidents.map(([id, label]) => yn(id, undefined, label)),
            text('incident_details', undefined, 'Please provide full details', {
              any: incidents.map(([id]) => yes(id)),
            }),
          ],
        },
        // added for online sale: the paper form has no period of insurance
        {
          id: 'period',
          title: 'Period of insurance',
          fields: [
            {
              id: 'cover_start',
              type: 'date',
              label: 'Cover to start on',
              role: 'coverStart',
              required: true,
              minDays: 0,
              maxDays: 60,
              docPlacement: 'declaration',
              width: 'half',
              row: 'period',
            },
            {
              id: 'cover_end',
              type: 'date',
              label: 'To expire on',
              role: 'coverEnd',
              help: 'Usually one year less a day after the start date.',
              required: true,
              minDays: 1,
              maxDays: 430,
              docPlacement: 'declaration',
              width: 'half',
              row: 'period',
            },
          ],
        },
      ],
    },
    {
      id: 'documents',
      title: 'Documents',
      description: 'Clear photos are fine. Use your phone camera, or attach files you already have.',
      sections: [
        businessIdentitySection(),
        {
          id: 'supporting',
          title: 'Supporting documents',
          fields: [
            {
              id: 'audited_accounts',
              type: 'file',
              kind: 'audited_accounts',
              label: 'Latest audited accounts (optional)',
              accept: ['pdf', 'image'],
              multiple: true,
              maxFiles: 3,
            },
            {
              id: 'security_certificates',
              type: 'file',
              kind: 'information_security_certificate',
              label: 'Information security certificates (e.g. ISO 27001, PCI DSS attestation)',
              showIf: { any: [yes('certified_standards'), yes('pci_dss')] },
              accept: ['pdf', 'image'],
              multiple: true,
              maxFiles: 4,
            },
            {
              id: 'outsourced_services_sheet',
              type: 'file',
              kind: 'outsourced_services_list',
              label: 'Separate sheet of outsourced services (optional)',
              docLabel: 'Please use a separate sheet if required',
              showIf: OUTSOURCES,
              accept: ['pdf', 'image'],
              multiple: true,
              maxFiles: 3,
            },
          ],
        },
      ],
    },
  ],
  declaration: {
    title: 'Declaration',
    paragraphs: [
      'It is declared that to the best of the knowledge and belief of the insured, after enquiry, that the statements and responses set out herein are true and accurate. The insured understands that it is under a duty to make a fair presentation of the risk to the insurer, and that all material circumstances that the insured is aware of or ought to be aware of have been disclosed to the insurer, or failing that, sufficient information to put a prudent insurer on notice that further enquiries are needed.',
      'The insured understands that non-disclosure or misrepresentation of a material fact or matter may impact the terms of the policy or impact whether the policy responds in whole or in part to a claim.',
      'The insured undertakes to inform the Insurers of any material alteration to the information provided herein or any new fact or matter that arises which may be relevant to the consideration of the proposal for insurance.',
      '(to be signed by Partner, Director, Principal or equivalent)',
    ],
    confirmations: [
      {
        id: 'true_after_enquiry',
        label: 'After enquiry, the statements and responses in this proposal are true and accurate.',
      },
      {
        id: 'fair_presentation',
        label: 'All material circumstances we know or ought to know of have been disclosed.',
      },
      {
        id: 'notify_changes',
        label: 'We will tell the insurers of any material change to the information given.',
      },
    ],
    fields: [
      {
        id: 'signatory_title',
        type: 'text',
        label: 'Title',
        help: 'Partner, Director, Principal or equivalent.',
        required: true,
        maxLength: 80,
      },
      {
        id: 'signatory_organisation',
        type: 'text',
        label: 'Organisation',
        required: true,
        prefill: 'companyName',
        maxLength: 160,
      },
    ],
    signatureLabel: 'Signed',
    dateLabel: 'Date',
  },
};
