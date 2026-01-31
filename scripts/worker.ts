import "dotenv/config";
import { pollJobs } from "../lib/jobs";

pollJobs().catch(console.error);
