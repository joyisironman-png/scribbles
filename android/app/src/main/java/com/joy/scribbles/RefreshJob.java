package com.joy.scribbles;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/** Background refresh: every ~15 minutes (Android's minimum), plus on demand. */
public class RefreshJob extends JobService {
    private static final int PERIODIC_ID = 4101;
    private static final int NOW_ID = 4102;

    static void schedulePeriodic(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null || js.getPendingJob(PERIODIC_ID) != null) return;
        js.schedule(new JobInfo.Builder(PERIODIC_ID, new ComponentName(c, RefreshJob.class))
                .setPeriodic(15 * 60 * 1000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .build());
    }

    static void runNow(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js == null) return;
        js.schedule(new JobInfo.Builder(NOW_ID, new ComponentName(c, RefreshJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .build());
    }

    static void cancelAll(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        if (js != null) {
            js.cancel(PERIODIC_ID);
            js.cancel(NOW_ID);
        }
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        new Thread(() -> {
            boolean retry = false;
            try {
                Store.fetch(getApplicationContext());
            } catch (Exception e) {
                retry = params.getJobId() == NOW_ID;
            }
            ScribbleWidget.renderAll(getApplicationContext());
            jobFinished(params, retry);
        }).start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
