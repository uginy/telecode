@real @aaa @priority-high @id:real-aaa-mega-refactor
Feature: AAA Mega Refactor legacy landing page

  Scenario: Split a 1500+ line legacy HTML landing into clean structure with bugs fixed
    Given a legacy landing page exists at tests/fixtures/mega-landing/legacy.html with ~1500 lines
    When the user asks to refactor and decompose the landing page into clean HTML/CSS/JS files
    Then the result should create a clean structure, fix intentional bugs, and keep the site functional
