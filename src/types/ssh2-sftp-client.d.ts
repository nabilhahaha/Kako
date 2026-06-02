// ssh2-sftp-client ships without bundled TypeScript declarations in this setup.
// The CSV/SFTP runtime imports it dynamically and narrows it to its own
// SftpClientLike interface, so an opaque module declaration is sufficient.
declare module 'ssh2-sftp-client';
