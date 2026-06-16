'use client';

import { useAuthStore } from '@/store/authStore';
import { MOCK_WEATHER, MOCK_SITES } from '@/mock-data/seed';
import { IRRIGATION_ADVISORY_LABELS } from '@/constants/enums';
import { formatRelativeTime, formatDateTime } from '@/utils/format';
import { CloudRain, Thermometer, Wind, Droplets, Clock, AlertCircle, Sun, Cloud } from 'lucide-react';
import { cn } from '@/utils/cn';

const ADVISORY_CONFIG = {
  proceed: { color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', icon: Sun },
  caution: { color: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400', icon: Cloud },
  hold: { color: 'bg-orange-500/10 border-orange-500/20 text-orange-400', icon: CloudRain },
  postpone: { color: 'bg-red-500/10 border-red-500/20 text-red-400', icon: CloudRain },
};

export default function WeatherPage() {
  const { session } = useAuthStore();
  const tenantId = session?.user.tenant_id;

  const weatherData = MOCK_WEATHER.filter(w => !tenantId || w.tenant_id === tenantId);

  return (
    <div className="space-y-4 fade-in">
      {/* Important Notice */}
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
        <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <div>
          <div className="text-sm font-semibold text-blue-400">Weather Advisory — Not Automatic Control</div>
          <div className="text-xs text-slate-400 mt-1">
            Weather data provides advisory information only. It does not automatically control irrigation or override scheduled operations in Phase-1.
            Operators must review the advisory and make manual decisions.
          </div>
        </div>
      </div>

      {/* Weather Cards per Site */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {weatherData.map(wx => {
          const site = MOCK_SITES.find(s => s.site_id === wx.site_id);
          const advisory = wx.irrigation_advisory;
          const AdvisoryIcon = ADVISORY_CONFIG[advisory].icon;
          const isExpired = new Date(wx.expires_at) < new Date();

          return (
            <div key={wx.cache_id} className="bg-[#111827] border border-slate-800/60 rounded-xl overflow-hidden">
              {/* Site header */}
              <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{site?.site_name ?? wx.site_id}</h3>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {wx.lat?.toFixed(4)}, {wx.lon?.toFixed(4)} · Fetched {formatRelativeTime(wx.fetched_at)}
                  </div>
                </div>
                {isExpired && (
                  <span className="text-[10px] px-2 py-1 rounded-lg bg-orange-500/10 text-orange-400 border border-orange-500/20">
                    Cache expired
                  </span>
                )}
              </div>

              <div className="p-4">
                {/* Main metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="bg-slate-800/40 rounded-xl p-3 text-center">
                    <CloudRain className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                    <div className="text-xl font-bold text-blue-400">{wx.rain_probability_pct}%</div>
                    <div className="text-[10px] text-slate-500">Rain Probability</div>
                  </div>
                  <div className="bg-slate-800/40 rounded-xl p-3 text-center">
                    <Droplets className="w-4 h-4 text-cyan-400 mx-auto mb-1" />
                    <div className="text-xl font-bold text-cyan-400">{wx.rain_forecast_mm}mm</div>
                    <div className="text-[10px] text-slate-500">Forecast Rain</div>
                  </div>
                  <div className="bg-slate-800/40 rounded-xl p-3 text-center">
                    <Thermometer className="w-4 h-4 text-orange-400 mx-auto mb-1" />
                    <div className="text-xl font-bold text-orange-400">{wx.temperature_min_c}–{wx.temperature_max_c}°C</div>
                    <div className="text-[10px] text-slate-500">Temp Range</div>
                  </div>
                  <div className="bg-slate-800/40 rounded-xl p-3 text-center">
                    <Wind className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                    <div className="text-xl font-bold text-white">{wx.wind_speed_kmh}</div>
                    <div className="text-[10px] text-slate-500">km/h Wind</div>
                  </div>
                </div>

                {/* Description */}
                <div className="text-sm text-slate-300 mb-4">{wx.weather_description}</div>

                {/* Humidity */}
                <div className="flex items-center gap-4 mb-4 text-xs text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Droplets className="w-3.5 h-3.5 text-blue-400" />
                    <span>Humidity: <strong className="text-white">{wx.humidity_pct}%</strong></span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>Expires: {formatDateTime(wx.expires_at)}</span>
                  </div>
                </div>

                {/* Advisory */}
                <div className={cn('rounded-xl border p-3.5', ADVISORY_CONFIG[advisory].color)}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <AdvisoryIcon className="w-4 h-4" />
                    <span className="text-sm font-bold">{IRRIGATION_ADVISORY_LABELS[advisory]}</span>
                  </div>
                  {wx.advisory_reason && (
                    <div className="text-xs opacity-80 leading-relaxed">{wx.advisory_reason}</div>
                  )}
                </div>

                {/* Rain probability bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-500">Rain Probability</span>
                    <span className="text-xs font-semibold text-blue-400">{wx.rain_probability_pct}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-1000',
                        wx.rain_probability_pct >= 70 ? 'bg-red-500' :
                        wx.rain_probability_pct >= 40 ? 'bg-yellow-500' : 'bg-blue-500'
                      )}
                      style={{ width: `${wx.rain_probability_pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                    <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {weatherData.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <CloudRain className="w-10 h-10 mx-auto mb-3 text-slate-700" />
          <div>No weather data available for your sites</div>
        </div>
      )}

      {/* Data source note */}
      <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-700/30 text-xs text-slate-500">
        <strong className="text-slate-400">Data Source:</strong> Weather data is fetched and cached server-side through Lambda/backend.
        No weather API keys are embedded in the frontend. Future AWS deployment will use Lambda weather cache via AppSync.
        Cache refresh interval: 2 hours. Location: GPS coordinates from commissioned device sites.
      </div>
    </div>
  );
}
