/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import moment from 'moment';
import { DETECTOR_TRIGGER_TIMEOUT, OPENSEARCH_DASHBOARDS_URL } from '../support/constants';
import indexSettings from '../fixtures/sample_windows_index_settings.json';
import aliasMappings from '../fixtures/sample_alias_mappings.json';
import indexDoc from '../fixtures/sample_document.json';
import ruleSettings from '../fixtures/integration_tests/rule/create_windows_usb_rule.json';
import { createDetector, setupIntercept } from '../support/helpers';
import { getLogTypeLabel } from '../../public/pages/LogTypes/utils/helpers';

const indexName = 'test-index';
const detectorName = 'test-detector';
const alertName = `${detectorName} alert condition`;

const date = moment(moment.now()).format('MM/DD/YY');
const docCount = 4;

let testDetector;
describe('Alerts', () => {
  before(() => {
    const subject = createDetector(
      detectorName,
      indexName,
      indexSettings,
      aliasMappings,
      ruleSettings,
      indexDoc,
      4
    );
    testDetector = subject.detector;

    // Wait for the detector to execute
    cy.wait(DETECTOR_TRIGGER_TIMEOUT);
  });

  beforeEach(() => {
    // Visit Alerts table page
    setupIntercept(cy, '/detectors/_search', 'detectorsSearch');
    // Visit Detectors page
    cy.visit(`${OPENSEARCH_DASHBOARDS_URL}/alerts`);
    cy.wait('@detectorsSearch').should('have.property', 'state', 'Complete');

    // Wait for page to load
    cy.waitForPageLoad('alerts', {
      contains: 'Security alerts',
    });

    // Filter table to only show alerts for the test detector
    cy.get(`input[type="search"]`).type(`${testDetector.name}{enter}`);

    // Adjust the date range picker to display alerts from today
    cy.get('[class="euiButtonEmpty__text euiQuickSelectPopover__buttonText"]').click({
      force: true,
    });
    cy.get('[data-test-subj="superDatePickerCommonlyUsed_Today"]').click({ force: true });
  });

  it('are generated', () => {
    setupIntercept(cy, '/_security_analytics/alerts', 'getAlerts', 'GET');
    // Refresh the table
    cy.get('[data-test-subj="superDatePickerApplyTimeButton"]').click({ force: true });
    cy.wait('@getAlerts').should('have.property', 'state', 'Complete');

    cy.wait(10000);

    // Confirm there are alerts created
    cy.get('tbody > tr').filter(`:contains(${alertName})`).should('have.length', docCount);
  });

  it('contain expected values in table', () => {
    // Confirm there is a row containing the expected values
    cy.get('tbody > tr').should(($tr) => {
      expect($tr, 'start time').to.contain(date);
      expect($tr, 'trigger name').to.contain(testDetector.triggers[0].name);
      expect($tr, 'detector name').to.contain(testDetector.name);
      expect($tr, 'status').to.contain('Active');
      expect($tr, 'severity').to.contain('1 (Highest)');
    });
  });

  it('contain expected values in alert details flyout', () => {
    cy.get('tbody > tr')
      .first()
      .within(() => {
        // Click the "View details" button for the first alert
        cy.get('[aria-label="View details"]').click({ force: true });
      });

    // Get the details flyout, and validate its content
    cy.get('[data-test-subj="alert-details-flyout"]').within(() => {
      // Confirm alert condition name
      cy.get('[data-test-subj="text-details-group-content-alert-trigger-name"]').contains(
        testDetector.triggers[0].name
      );

      // Confirm alert status
      cy.get('[data-test-subj="text-details-group-content-alert-status"]').contains('Active');

      // Confirm alert severity
      cy.get('[data-test-subj="text-details-group-content-alert-severity"]').contains(
        '1 (Highest)'
      );

      // Confirm alert start time is present
      cy.get('[data-test-subj="text-details-group-content-start-time"]').contains(date);

      // Confirm alert last updated time is present
      cy.get('[data-test-subj="text-details-group-content-last-updated-time"]').contains(date);

      // Confirm alert detector name
      cy.get('[data-test-subj="text-details-group-content-detector"]').contains(testDetector.name);

      // Wait for the findings table to finish loading
      cy.contains('Findings (1)');
      cy.contains('Detection rules');

      // Confirm alert findings contain expected values
      cy.get('tbody > tr').should(($tr) => {
        expect($tr, `timestamp`).to.contain(date);
        expect($tr, `detection`).to.contain('Detection rules');
        expect($tr, `detector name`).to.contain(testDetector.name);
        expect($tr, `log type`).to.contain(
          `System Activity: ${getLogTypeLabel(testDetector.detector_type)}`
        );
      });

      // Close the flyout
      cy.get('[data-test-subj="alert-details-flyout-close-button"]').click({ force: true });
    });

    // Confirm flyout has been closed
    cy.contains('[data-test-subj="alert-details-flyout"]').should('not.exist');
  });

  it('contain expected values in finding details flyout', () => {
    // Open first alert details flyout
    cy.get('tbody > tr')
      .first()
      .within(() => {
        // Click the "View details" button for the first alert
        cy.get('[aria-label="View details"]').click({ force: true });
      });

    cy.wait(10000);

    cy.get('[data-test-subj="alert-details-flyout"]').within(() => {
      // Wait for findings table to finish loading
      cy.wait(3000);
      cy.contains('Detection rules');

      // Click the details button for the first finding
      cy.get('tbody > tr')
        .first()
        .within(() => {
          cy.get('[data-test-subj="finding-details-flyout-button"]').click({
            force: true,
          });
        });
    });

    // Confirm the details flyout contains the expected content
    cy.get('[data-test-subj="finding-details-flyout"]').within(() => {
      // Confirm finding ID is present
      cy.get('[data-test-subj="finding-details-flyout-finding-id"]')
        .invoke('text')
        .then((text) => expect(text).to.have.length.greaterThan(1));

      // Confirm finding timestamp
      cy.get('[data-test-subj="finding-details-flyout-timestamp"]').contains(date);

      // Confirm finding detection type
      cy.get('[data-test-subj="finding-details-flyout-detection-type"]').contains(
        'Detection rules'
      );

      // Confirm there's only 1 rule details accordion
      cy.get('[data-test-subj="finding-details-flyout-rule-accordion-1"]').should('not.exist');

      // Check the rule details accordion for the expected values
      cy.get('[data-test-subj="finding-details-flyout-rule-accordion-0"]').within(() => {
        // Confirm the accordion button contains the expected name
        cy.get('[data-test-subj="finding-details-flyout-rule-accordion-button"]').contains(
          'Cypress USB Rule'
        );

        // Confirm the accordion button contains the expected severity
        cy.get('[data-test-subj="finding-details-flyout-rule-accordion-button"]').contains(
          'Severity: High'
        );

        // Confirm the rule name
        cy.get('[data-test-subj="finding-details-flyout-Cypress USB Rule-details"]').contains(
          'Cypress USB Rule'
        );

        // Confirm the rule severity
        cy.get('[data-test-subj="finding-details-flyout-rule-severity"]').contains('High');

        // Confirm the rule category
        cy.get('[data-test-subj="finding-details-flyout-rule-category"]').contains(
          getLogTypeLabel(testDetector.detector_type)
        );

        // Confirm the rule description
        cy.get('[data-test-subj="finding-details-flyout-rule-description"]').contains(
          'USB plugged-in rule'
        );

        // Confirm the rule tags
        ['high', 'windows'].forEach((tag) => {
          cy.get('[data-test-subj="finding-details-flyout-rule-tags"]').contains(tag);
        });
      });

      // Confirm the rule index
      cy.get('[data-test-subj="finding-details-flyout-rule-document-index"]').contains(indexName);

      // Confirm there is atleast one row of document
      cy.get('tbody > tr').should('have.length.least', 1);

      // Confirm the rule document matches
      // The EuiCodeEditor used for this component stores each line of the JSON in an array of elements;
      // so this test formats the expected document into an array of strings,
      // and matches each entry with the corresponding element line.
      const document = JSON.stringify(JSON.parse('{"winlog.event_id": 2003}'), null, 2);
      const documentLines = document.split('\n');

      cy.get('[data-test-subj="finding-details-flyout-rule-document-0"]')
        .get('[class="euiCodeBlock__line"]')
        .each((lineElement, lineIndex) => {
          let line = lineElement.text();
          let expectedLine = documentLines[lineIndex];

          // The document ID field is generated when the document is added to the index,
          // so this test just checks that the line starts with the ID key.
          if (expectedLine.trimStart().startsWith('"id": "')) {
            expectedLine = '"id": "';
            expect(line, `document JSON line ${lineIndex}`).to.contain(expectedLine);
          } else {
            line = line.replaceAll('\n', '');
            expect(line, `document JSON line ${lineIndex}`).to.equal(expectedLine);
          }
        });

      // Press the "back" button
      cy.get('[data-test-subj="finding-details-flyout-back-button"]').click({ force: true });
    });

    // Confirm finding details flyout closed
    cy.get('[data-test-subj="finding-details-flyout"]').should('not.exist');

    // Confirm the expected alert details flyout rendered
    cy.get('[data-test-subj="alert-details-flyout"]').within(() => {
      cy.get('[data-test-subj="text-details-group-content-alert-trigger-name"]').contains(
        testDetector.triggers[0].name
      );
    });
  });

  it('can be bulk acknowledged', () => {
    // Confirm the "Acknowledge" button is disabled when no alerts are selected
    cy.get('[data-test-subj="acknowledge-button"]').should('be.disabled');

    // Confirm there is alert which is currently "Active"
    cy.get('tbody > tr').should(($tr) => {
      expect($tr, `status`).to.contain('Active');
    });

    // Click the checkboxes for the first and last alerts.
    cy.get('tbody > tr')
      .first()
      .within(() => {
        cy.get('[class="euiCheckbox__input"]').click({ force: true });
      });

    // Press the "Acknowledge" button
    cy.get('[data-test-subj="acknowledge-button"]').click({ force: true });

    cy.wait(10000);

    // Wait for acknowledge API to finish executing
    cy.contains('Acknowledged');

    // Filter the table to show only "Acknowledged" alerts
    cy.get('[data-text="Status"]').click({ force: true });
    cy.get('[class="euiFilterSelect__items"]').within(() => {
      cy.contains('Acknowledged').click({ force: true });
    });

    // Confirm there is an "Acknowledged" alert
    cy.get('tbody > tr').should(($tr) => {
      expect($tr, `alert name`).to.contain(alertName);
      expect($tr, `status`).to.contain('Acknowledged');
    });

    // Filter the table to show only "Active" alerts
    cy.get('[data-text="Status"]');
    cy.get('[class="euiFilterSelect__items"]').within(() => {
      cy.contains('Acknowledged').click({ force: true });
    });

    // Confirm there are now 2 "Acknowledged" alerts
    cy.get('tbody > tr')
      .filter(`:contains(${alertName})`)
      .should('contain', 'Active')
      .should('contain', 'Acknowledged');
  });

  it('can be acknowledged via row button', () => {
    // Filter the table to show only "Active" alerts
    cy.get('[data-text="Status"]').click({ force: true });
    cy.get('[class="euiFilterSelect__items"]').within(() => {
      cy.contains('Active').click({ force: true });
    });

    cy.wait(10000);
    cy.get('tbody > tr').filter(`:contains(${alertName})`).should('have.length', 3);

    cy.get('tbody > tr')
      // Click the "Acknowledge" icon button in the first row
      .first()
      .within(() => {
        cy.get('[aria-label="Acknowledge"]').click({ force: true });
      });

    cy.wait(10000);
    cy.get('tbody > tr').filter(`:contains(${alertName})`).should('have.length', 2);

    // Filter the table to show only "Acknowledged" alerts
    cy.get('[data-text="Status"]').click({ force: true });
    cy.get('[class="euiFilterSelect__items"]').within(() => {
      cy.contains('Active').click({ force: true });
      cy.contains('Acknowledged').click({ force: true });
    });

    cy.wait(10000);
    // Confirm there are now 2 "Acknowledged" alerts
    cy.get('tbody > tr').filter(`:contains(${alertName})`).should('have.length', 2);
  });

  it('can be acknowledged via flyout button', () => {
    // Filter the table to show only "Active" alerts
    cy.get('[data-text="Status"]').click({ force: true });
    cy.get('[class="euiFilterSelect__items"]').within(() => {
      cy.contains('Active').click({ force: true });
    });

    cy.get('tbody > tr')
      .first()
      .within(() => {
        // Click the "View details" button for the first alert
        cy.get('[aria-label="View details"]').click({ force: true });
      });

    cy.get('[data-test-subj="alert-details-flyout"]').within(() => {
      // Confirm the alert is currently "Active"
      cy.get('[data-test-subj="text-details-group-content-alert-status"]').contains('Active');

      // Click the "Acknowledge" button on the flyout
      cy.get('[data-test-subj="alert-details-flyout-acknowledge-button"]').click({ force: true });

      cy.wait(5000);

      // Confirm the alert is now "Acknowledged"
      cy.get('[data-test-subj="text-details-group-content-alert-status"]').contains('Active');

      // Confirm the "Acknowledge" button is disabled
      cy.get('[data-test-subj="alert-details-flyout-acknowledge-button"]').should('be.disabled');
    });
  });

  after(() => cy.cleanUpTests());
});
