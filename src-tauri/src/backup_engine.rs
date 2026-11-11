//! Backup engine: recursive copy of source paths with include/exclude masks.

use crate::config::BackupJob;
use crate::errors::{AppError, AppResult};
use glob::Pattern;
use std::fs;
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Result of a single backup run.
#[derive(Debug, Clone)]
pub struct BackupResult {
    pub job_id: String,
    pub job_name: String,
    pub started_at: String,
    pub finished_at: String,
    pub files_copied: u64,
    pub bytes_copied: u64,
    pub errors: Vec<String>,
}

/// Check whether a path matches any include mask (and is not excluded).
fn path_matches(path: &Path, job: &BackupJob) -> bool {
    let rel_str = path.to_string_lossy();

    // Exclude masks take precedence.
    for excl in &job.exclude_masks {
        if let Ok(pat) = Pattern::new(excl) {
            if pat.matches(&rel_str) {
                return false;
            }
        }
    }

    // If include masks are defined, at least one must match.
    if !job.include_masks.is_empty() {
        for incl in &job.include_masks {
            if let Ok(pat) = Pattern::new(incl) {
                if pat.matches(&rel_str) {
                    return true;
                }
            }
        }
        return false;
    }

    true
}

/// Copy a single file preserving relative structure inside output dir.
fn copy_file(source: &Path, dest: &Path) -> AppResult<u64> {
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    let copied = fs::copy(source, dest)?;
    Ok(copied as u64)
}

/// Run a backup job.
pub fn run_backup(job: &BackupJob) -> AppResult<BackupResult> {
    let started_at = chrono::Utc::now().to_rfc3339();
    let mut files_copied: u64 = 0;
    let mut bytes_copied: u64 = 0;
    let mut errors: Vec<String> = Vec::new();

    // Validate output directory.
    if !job.output_path.exists() {
        fs::create_dir_all(&job.output_path)?;
    }

    for source in &job.source_paths {
        if !source.exists() {
            errors.push(format!("Source does not exist: {:?}", source));
            continue;
        }

        if source.is_file() {
            // Single file: copy preserving filename.
            let file_name = source
                .file_name()
                .ok_or_else(|| AppError::Backup(format!("Invalid file name: {:?}", source)))?;
            let dest = job.output_path.join(file_name);
            match copy_file(source, &dest) {
                Ok(size) => {
                    files_copied += 1;
                    bytes_copied += size;
                }
                Err(e) => errors.push(format!("Failed to copy {:?}: {}", source, e)),
            }
            continue;
        }

        // Directory: recursive walk.
        for entry in WalkDir::new(source)
            .into_iter()
            .filter_entry(|e| path_matches(e.path(), job))
        {
            let entry = match entry {
                Ok(e) => e,
                Err(e) => {
                    errors.push(format!("Walk error: {}", e));
                    continue;
                }
            };

            let path = entry.path();
            if path.is_file() {
                // Compute relative path from source root.
                let rel = match path.strip_prefix(source) {
                    Ok(r) => r.to_path_buf(),
                    Err(_) => path.clone(),
                };
                let dest = job.output_path.join(&rel);

                if !path_matches(path, job) {
                    continue;
                }

                match copy_file(path, &dest) {
                    Ok(size) => {
                        files_copied += 1;
                        bytes_copied += size;
                    }
                    Err(e) => errors.push(format!("Failed to copy {:?}: {}", path, e)),
                }
            }
        }
    }

    let finished_at = chrono::Utc::now().to_rfc3339();

    Ok(BackupResult {
        job_id: job.id.clone(),
        job_name: job.name.clone(),
        started_at,
        finished_at,
        files_copied,
        bytes_copied,
        errors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_matches_include_only() {
        let job = BackupJob {
            include_masks: vec!["*.txt".into()],
            exclude_masks: Vec::new(),
            ..Default::default()
        };
        assert!(path_matches(Path::new("notes.txt"), &job));
        assert!(!path_matches(Path::new("image.png"), &job));
    }

    #[test]
    fn test_exclude_takes_precedence() {
        let job = BackupJob {
            include_masks: vec!["*".into()],
            exclude_masks: vec!["*tmp*".into()],
            ..Default::default()
        };
        assert!(!path_matches(Path::new("cache.tmp"), &job));
        assert!(path_matches(Path::new("data.txt"), &job));
    }
}
