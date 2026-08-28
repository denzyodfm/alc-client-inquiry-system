// The system change log shown to administrators under Settings.
//
// Entries come from the git history, which is the only record of this work that is complete
// and carries real dates. Where the request that prompted a change was captured during a
// working session it is shown alongside; older entries carry their commit subject only,
// because those conversations were not recorded at the time.

export type ChangeLogEntry = {
  // Position in the history, 1 being the first commit. Stable for referring to an entry.
  number: number;
  date: string;
  commit: string;
  title: string;
  request?: string;
};

export { CHANGE_LOG } from "@/lib/change-log-data";
