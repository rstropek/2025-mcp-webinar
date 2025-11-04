/**
 * OpenAI Agent SDK Tool for renting bikes at a hotel.
 * 
 * An available bike consists of the following properties:
 * - id: string
 * - description: string (e.g. "Blue city bike with a basket", "Tandem bike for two")
 * - pricePerHourEuro: number (a value between 5 and 20)
 * 
 * A bike rental consists of the following properties:
 * - bikeId: string
 * - roomNumber: string
 * - rentalStartDateTime: UTC DateTime in ISO 8601 format
 * - nameOfRenter: string
 */

import { tool } from '@openai/agents';
import sqlite from 'better-sqlite3';
import z from 'zod';

function setupDatabase(dbName: string): sqlite.Database {
    const db = sqlite(dbName);
    // Each table has an auto-incrementing id column.
    db.exec(`
    CREATE TABLE IF NOT EXISTS bikes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT,
      pricePerHourEuro REAL
    )
  `);
    db.exec(`
    CREATE TABLE IF NOT EXISTS bikeRentals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bikeId INTEGER,
      roomNumber TEXT,
      rentalStartDateTime DATETIME,
      nameOfRenter TEXT,
      FOREIGN KEY (bikeId) REFERENCES bikes(id)
    )
  `);

    // If bikes table is empty, add some bikes
    const bikes = db.prepare('SELECT COUNT(*) AS count FROM bikes').get() as { count: number };
    if (bikes.count === 0) {
        db.prepare('INSERT INTO bikes (description, pricePerHourEuro) VALUES (?, ?)').run('Blue city bike with a basket', 5);
        db.prepare('INSERT INTO bikes (description, pricePerHourEuro) VALUES (?, ?)').run('Tandem bike for two', 10);
        db.prepare('INSERT INTO bikes (description, pricePerHourEuro) VALUES (?, ?)').run('Electric bike', 15);
        db.prepare('INSERT INTO bikes (description, pricePerHourEuro) VALUES (?, ?)').run('Mountain bike', 20);
    }

    return db;
}

const db = setupDatabase('bikes.db');

export const getAvailableBikesTool = tool({
    name: 'get_available_bikes',
    description: 'Returns all bikes that are currently available for rental. For each bike, the id, description and pricePerHourEuro are returned.',
    strict: true,
    parameters: z.object({}),
    execute: async () => {
        const bikes = db.prepare('SELECT id, description, pricePerHourEuro FROM bikes WHERE id NOT IN (SELECT bikeId FROM bikeRentals)').all();
        return JSON.stringify(bikes);
    },
});

export const rentBikeTool = tool({
    name: 'rent_bike',
    description: 'Rents a given bike for a roomNumber and nameOfRenter',
    strict: true,
    parameters: z.object({
        bikeId: z.string(),
        roomNumber: z.string().nonempty(),
        nameOfRenter: z.string().nonempty(),
    }),
    execute: async ({ bikeId, roomNumber, nameOfRenter }) => {

        // Check if the bike is available
        const bike = db.prepare('SELECT id FROM bikes WHERE id = ?').get(bikeId);
        if (!bike) {
            return 'Bike not found';
        }

        // Check if the bike is already rented
        const rental = db.prepare('SELECT id FROM bikeRentals WHERE bikeId = ?').get(bikeId);
        if (rental) {
            return 'Bike already rented';
        }

        // Rent the bike
        const startDateTime = new Date().toISOString();
        db.prepare('INSERT INTO bikeRentals (bikeId, roomNumber, rentalStartDateTime, nameOfRenter) VALUES (?, ?, ?, ?)').run(bikeId, roomNumber, startDateTime, nameOfRenter);
        return 'Bike rented successfully';
    },
});

export const returnBikeTool = tool({
    name: 'return_bike',
    description: 'Returns a given bike. The rental duration and rental cost in Euros are returned.',
    strict: true,
    parameters: z.object({
        bikeId: z.number().int(),
    }),
    execute: async ({ bikeId }) => {
        // Check if the bike is rented
        const rental = db.prepare('SELECT bikeRentals.id, bikeRentals.rentalStartDateTime, bikes.pricePerHourEuro FROM bikeRentals INNER JOIN bikes ON bikeRentals.bikeId = bikes.id WHERE bikeRentals.bikeId = ?').get(bikeId) as { id: number, rentalStartDateTime: string, pricePerHourEuro: number } | undefined;
        if (!rental) {
            return 'Bike not rented';
        }

        // Return the bike
        const endDateTime = new Date().toISOString();

        // Calculate the rental duration in hours
        const rentalDuration = (new Date(endDateTime).getTime() - new Date(rental.rentalStartDateTime).getTime()) / (1000 * 60 * 60);
        const rentalCost = rentalDuration * rental.pricePerHourEuro;

        db.prepare('DELETE FROM bikeRentals WHERE id = ?').run(rental.id);
        return `Bike returned successfully. The rental duration was ${rentalDuration} hours and the rental cost was ${rentalCost.toFixed(2)}€.`;
    },
});