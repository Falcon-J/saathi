# Requirements Document

## Introduction

Fix the header status indicators in the Saathi collaborative task manager to accurately display online connectivity status and real-time synchronization state. The current implementation shows misleading information about network connectivity and sync status.

## Glossary

- **Header_Component**: The top navigation bar displaying user info and status indicators
- **Online_Status_Indicator**: Visual element showing network connectivity state
- **Sync_Status_Indicator**: Visual element showing real-time synchronization state
- **Collaboration_Hook**: React hook managing activity polling and sync state
- **Activity_API**: Backend endpoint handling activity tracking and retrieval

## Requirements

### Requirement 1

**User Story:** As a user, I want to see accurate online/offline status, so that I know if I'm connected to the service

#### Acceptance Criteria

1. WHEN the network connection is available and API responds successfully, THE Header_Component SHALL display "Online" with green indicator
2. WHEN the network connection is unavailable, THE Header_Component SHALL display "Offline" with red indicator
3. WHEN the API is unreachable but network is available, THE Header_Component SHALL display "Connection Issues" with yellow indicator
4. THE Online_Status_Indicator SHALL update within 10 seconds of connectivity changes
5. THE Online_Status_Indicator SHALL show appropriate icons (Wifi/WifiOff/AlertTriangle) based on connection state

### Requirement 2

**User Story:** As a user, I want to see real-time sync status, so that I know if my data is being synchronized with other team members

#### Acceptance Criteria

1. WHEN activity polling is successful and recent, THE Sync_Status_Indicator SHALL display "Real-time sync" with active styling
2. WHEN activity polling fails or is stale, THE Sync_Status_Indicator SHALL display "Sync paused" with inactive styling
3. WHEN sync is reconnecting after failure, THE Sync_Status_Indicator SHALL display "Reconnecting..." with loading animation
4. THE Sync_Status_Indicator SHALL show last successful sync timestamp when sync is paused
5. THE Sync_Status_Indicator SHALL automatically retry connection every 30 seconds when sync fails

### Requirement 3

**User Story:** As a user, I want to retry connection when there are issues, so that I can restore real-time collaboration quickly

#### Acceptance Criteria

1. WHEN connection issues occur, THE Header_Component SHALL display a retry button
2. WHEN the retry button is clicked, THE Collaboration_Hook SHALL immediately attempt to reconnect
3. WHEN retry is in progress, THE Header_Component SHALL show loading state
4. THE Header_Component SHALL provide visual feedback for successful reconnection
5. THE Header_Component SHALL limit retry attempts to prevent spam (max 3 attempts per minute)
