# MCP Server for Password Generation

## Introduction

This program implements a stdio MCP Server (Model Context Protocol Server) that generates passwords from random characters and digits. It offers two operations:

* Generate single password
  * Accepts a length parameter (max. value 25) and returns a randomly generated password of that length.
* Generate multiple passwords
  * Accepts a count (max. value 10) and a length (max. value 25) and returns a list of randomly generated passwords, each of the specified length.

## Password Generation Rules

* Each password must start with a lowercase letter.
* No letter or digit may appear more than once in a single password.
* Passwords are generated using a combination of lowercase letters (a-z), uppercase letters (A-Z), and digits (0-9).

## Project Structure

* The project uses TypeScript
* Sourcecode is located in the `src` directory
* TSX is used to execute TypeScript files
* For testing, we use the MCP Inspector (see also _package.json_ scripts)
* The project contains a skill for MCP Server implementation
