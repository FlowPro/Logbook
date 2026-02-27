import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, Printer, Anchor } from 'lucide-react'
import { useShip } from '../hooks/useShip'
import { generateShipDossierPDF } from '../utils/pdf'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { CountrySelect } from '../components/ui/CountrySelect'
import { Card, CardHeader } from '../components/ui/Card'
import { FileUpload } from '../components/ui/FileUpload'
import type { DocumentAttachment } from '../db/models'

const schema = z.object({
  name: z.string().min(1),
  type: z.string(),
  manufacturer: z.string(),
  model: z.string(),
  yearBuilt: z.number().min(1900).max(2100),
  flag: z.string(),
  homePort: z.string(),
  registrationNumber: z.string(),
  registrationCountry: z.string(),
  mmsi: z.string(),
  callSign: z.string(),
  imoNumber: z.string(),
  loaMeters: z.number().min(0),
  beamMeters: z.number().min(0),
  draftMeters: z.number().min(0),
  displacementTons: z.number().min(0),
  sailAreaSqm: z.number().min(0),
  engineType: z.string(),
  enginePowerKw: z.number().min(0),
  fuelCapacityL: z.number().min(0),
  fuelType: z.string(),
  waterCapacityL: z.number().min(0),
  insuranceCompany: z.string(),
  insurancePolicyNr: z.string(),
  insuranceValidity: z.string(),
  insuranceExpiry: z.string(),
  contactEmail: z.string(),
  contactPhone: z.string(),
})

type FormData = z.infer<typeof schema>

const DEFAULTS: FormData = {
  name: '', type: 'Segelyacht', manufacturer: '', model: '', yearBuilt: 2000,
  flag: 'DE', homePort: '', registrationNumber: '', registrationCountry: 'Germany',
  mmsi: '', callSign: '', imoNumber: '',
  loaMeters: 0, beamMeters: 0, draftMeters: 0, displacementTons: 0, sailAreaSqm: 0,
  engineType: '', enginePowerKw: 0, fuelCapacityL: 0, fuelType: 'Diesel', waterCapacityL: 0,
  insuranceCompany: '', insurancePolicyNr: '', insuranceValidity: '', insuranceExpiry: '',
  contactEmail: '', contactPhone: '',
}

export function ShipData() {
  const { t } = useTranslation()
  const { ship, saveShip } = useShip()
  const [documents, setDocuments] = useState<DocumentAttachment[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: DEFAULTS,
  })

  useEffect(() => {
    if (ship) {
      reset({
        name: ship.name, type: ship.type, manufacturer: ship.manufacturer, model: ship.model,
        yearBuilt: ship.yearBuilt, flag: ship.flag, homePort: ship.homePort,
        registrationNumber: ship.registrationNumber, registrationCountry: ship.registrationCountry,
        mmsi: ship.mmsi, callSign: ship.callSign, imoNumber: ship.imoNumber,
        loaMeters: ship.loaMeters, beamMeters: ship.beamMeters, draftMeters: ship.draftMeters,
        displacementTons: ship.displacementTons, sailAreaSqm: ship.sailAreaSqm,
        engineType: ship.engineType, enginePowerKw: ship.enginePowerKw,
        fuelCapacityL: ship.fuelCapacityL, fuelType: ship.fuelType,
        waterCapacityL: ship.waterCapacityL, insuranceCompany: ship.insuranceCompany,
        insurancePolicyNr: ship.insurancePolicyNr, insuranceValidity: ship.insuranceValidity,
        insuranceExpiry: ship.insuranceExpiry,
        contactEmail: ship.contactEmail ?? '', contactPhone: ship.contactPhone ?? '',
      })
      setDocuments(ship.documents ?? [])
    }
  }, [ship, reset])

  async function onSubmit(data: FormData) {
    setSaving(true)
    try {
      await saveShip({ ...data, documents })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const r2 = 'grid grid-cols-1 md:grid-cols-2 gap-4'
  const r3 = 'grid grid-cols-1 md:grid-cols-3 gap-4'

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">{t('ship.title')}</h1>
        <div className="flex gap-2">
          {ship && (
            <Button variant="secondary" icon={<Printer className="w-4 h-4" />} onClick={() => generateShipDossierPDF(ship)}>
              {t('ship.printDossier')}
            </Button>
          )}
          <Button onClick={handleSubmit(onSubmit)} loading={saving} icon={<Save className="w-4 h-4" />}>
            {saved ? t('common.saved') : t('common.save')}
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader title={t('ship.identity')} icon={<Anchor className="w-4 h-4" />} />
          <div className="space-y-4">
            <div className={r2}>
              <Input label={t('ship.name')} {...register('name')} error={errors.name?.message} required />
              <Input label={t('ship.type')} {...register('type')} />
            </div>
            <div className={r3}>
              <Input label={t('ship.manufacturer')} {...register('manufacturer')} />
              <Input label={t('ship.model')} {...register('model')} />
              <Input label={t('ship.yearBuilt')} type="number" {...register('yearBuilt', { valueAsNumber: true })} />
            </div>
            <div className={r2}>
              <Controller name="flag" control={control} render={({ field }) => (
                <CountrySelect label={t('ship.flag')} valueType="code" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
              )} />
              <Input label={t('ship.homePort')} {...register('homePort')} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('ship.registration')} />
          <div className="space-y-4">
            <div className={r2}>
              <Input label={t('ship.registrationNumber')} {...register('registrationNumber')} />
              <Controller name="registrationCountry" control={control} render={({ field }) => (
                <CountrySelect label={t('ship.registrationCountry')} valueType="name" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
              )} />
            </div>
            <div className={r2}>
              <Input label={t('ship.mmsi')} {...register('mmsi')} />
              <Input label={t('ship.callSign')} {...register('callSign')} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('ship.dimensions')} />
          <div className="space-y-4">
            <div className={r3}>
              <Input label={t('ship.loa')} type="text" inputMode="decimal" {...register('loaMeters', { setValueAs: (v: string) => parseFloat(String(v).replace(',', '.')) || 0 })} />
              <Input label={t('ship.beam')} type="text" inputMode="decimal" {...register('beamMeters', { setValueAs: (v: string) => parseFloat(String(v).replace(',', '.')) || 0 })} />
              <Input label={t('ship.draft')} type="text" inputMode="decimal" {...register('draftMeters', { setValueAs: (v: string) => parseFloat(String(v).replace(',', '.')) || 0 })} />
            </div>
            <div className={r2}>
              <Input label={t('ship.displacement')} type="text" inputMode="decimal" {...register('displacementTons', { setValueAs: (v: string) => parseFloat(String(v).replace(',', '.')) || 0 })} />
              <Input label={t('ship.sailArea')} type="text" inputMode="decimal" {...register('sailAreaSqm', { setValueAs: (v: string) => parseFloat(String(v).replace(',', '.')) || 0 })} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('ship.engine')} />
          <div className="space-y-4">
            <div className={r2}>
              <Input label={t('ship.engineType')} {...register('engineType')} />
              <Input label={t('ship.enginePower')} type="text" inputMode="decimal" {...register('enginePowerKw', { setValueAs: (v: string) => parseFloat(String(v).replace(',', '.')) || 0 })} />
            </div>
            <div className={r3}>
              <Input label={t('ship.fuelType')} {...register('fuelType')} />
              <Input label={t('ship.fuelCapacity')} type="text" inputMode="decimal" {...register('fuelCapacityL', { setValueAs: (v: string) => parseFloat(String(v).replace(',', '.')) || 0 })} />
              <Input label={t('ship.waterCapacity')} type="text" inputMode="decimal" {...register('waterCapacityL', { setValueAs: (v: string) => parseFloat(String(v).replace(',', '.')) || 0 })} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('ship.insurance')} />
          <div className="space-y-4">
            <div className={r2}>
              <Input label={t('ship.insuranceCompany')} {...register('insuranceCompany')} />
              <Input label={t('ship.policyNumber')} {...register('insurancePolicyNr')} />
            </div>
            <div className={r2}>
              <Input label={t('ship.validity')} type="date" {...register('insuranceValidity')} />
              <Input label={t('ship.expiry')} type="date" {...register('insuranceExpiry')} />
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t('ship.contact')} />
          <p className="text-xs text-gray-400 mb-3 -mt-1">{t('ship.contactNote')}</p>
          <div className={r2}>
            <Input label="E-Mail" type="email" {...register('contactEmail')} />
            <Input label="Telefon / Phone" type="tel" {...register('contactPhone')} />
          </div>
        </Card>

        <Card>
          <CardHeader title={t('ship.documents')} />
          <FileUpload
            label={t('ship.uploadDocument')}
            attachments={documents}
            onUpload={(att) => setDocuments(prev => [...prev, att])}
            onRemove={(idx) => setDocuments(prev => prev.filter((_, i) => i !== idx))}
            accept="image/*,application/pdf"
            multiple
          />
        </Card>

        <div className="flex justify-end">
          <Button type="submit" loading={saving} icon={<Save className="w-4 h-4" />}>
            {saved ? t('common.saved') : t('common.save')}
          </Button>
        </div>
      </form>
    </div>
  )
}
