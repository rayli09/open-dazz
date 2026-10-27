/** Product capabilities differ by host; screen geometry stays in CSS media queries. */
export const platform = import.meta.env.MODE === "ios"
  ? { kind: "ios", video: false, photoDestination: "photos", sessionRecovery: false }
  : import.meta.env.MODE === "desktop"
    ? { kind: "desktop", video: true, photoDestination: "file", sessionRecovery: true }
    : { kind: "web", video: true, photoDestination: "download", sessionRecovery: true };
